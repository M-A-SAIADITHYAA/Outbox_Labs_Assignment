import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { RateLimiterService } from '../services/rate-limiter.service';
import { enqueueEmailDispatchJob } from '../queues/email.queue';
import { emailWorker } from '../workers/email.worker';
import { redisClient } from '../config/redis';

const prisma = new PrismaClient();

async function runPhase2Verification() {
  console.log('🧪 ===================================================');
  console.log('🧪 RUNNING PHASE 2 VERIFICATION TEST SUITE');
  console.log('🧪 ===================================================\n');

  // TEST 1: Atomic Rate Limiter Lua Script
  console.log('🔬 TEST 1: Verifying Atomic Redis Rate Limiter & Deduplication...');
  const testSenderId = `test-sender-${Date.now()}`;
  const testLimit = 3;
  const testDelayMs = 500;

  // Clean slate for sender
  await RateLimiterService.resetSenderLimits(testSenderId);

  // Send 3 allowed requests
  for (let i = 1; i <= testLimit; i++) {
    const res = await RateLimiterService.checkAndAllocate(testSenderId, testLimit, testDelayMs);
    console.log(`  Token ${i}: Allowed=${res.allowed}, Count=${res.currentCount}, SlackTrigger=${res.triggerSlack}`);
    if (!res.allowed || res.currentCount !== i) {
      throw new Error(`Token ${i} should be allowed with count ${i}`);
    }
  }

  // 4th request must be REJECTED and TRIGGER SLACK
  const breach1 = await RateLimiterService.checkAndAllocate(testSenderId, testLimit, testDelayMs);
  console.log(`  Token 4 (Breach): Allowed=${breach1.allowed}, SlackTrigger=${breach1.triggerSlack}, NextWindow=${new Date(breach1.nextWindowTimestamp!).toISOString()}`);
  if (breach1.allowed || !breach1.triggerSlack || !breach1.nextWindowTimestamp) {
    throw new Error('Token 4 should be rejected and trigger Slack alert for the first breach');
  }

  // 5th request must be REJECTED but NOT TRIGGER SLACK (deduplication)
  const breach2 = await RateLimiterService.checkAndAllocate(testSenderId, testLimit, testDelayMs);
  console.log(`  Token 5 (Subsequent Breach): Allowed=${breach2.allowed}, SlackTrigger=${breach2.triggerSlack}`);
  if (breach2.allowed || breach2.triggerSlack) {
    throw new Error('Token 5 should be rejected and NOT trigger Slack alert again (deduped)');
  }
  console.log('✅ TEST 1 PASSED: Atomic rate limiting, next-hour calculation, and Slack deduping verified!\n');

  // TEST 2: End-to-End BullMQ Worker & Ethereal SMTP Delivery
  console.log('🔬 TEST 2: Verifying BullMQ Queue, Worker Concurrency, and Ethereal SMTP Dispatch...');
  const defaultSender = await prisma.senderIdentity.findFirst({
    where: { isDefault: true },
    include: { user: true },
  });

  if (!defaultSender) {
    throw new Error('Default sender identity not found in database. Did you run prisma seed?');
  }

  const idempotencyKey = crypto.randomBytes(16).toString('hex');
  const scheduledTime = new Date();

  const emailRecord = await prisma.emailRecord.create({
    data: {
      userId: defaultSender.userId,
      senderId: defaultSender.id,
      recipientEmail: 'lead-test@example.com',
      recipientName: 'Test Lead',
      subject: 'ReachInbox Scheduler Verification Test',
      bodyText: 'This email proves that BullMQ, Redis, PostgreSQL, and Ethereal SMTP are fully operational.',
      idempotencyKey,
      scheduledAt: scheduledTime,
      status: 'SCHEDULED',
    },
  });

  console.log(`  Created test email record: ${emailRecord.id}`);

  // Enqueue job with 0 delay to test immediate processing
  await enqueueEmailDispatchJob({
    emailRecordId: emailRecord.id,
    senderId: defaultSender.id,
    recipientEmail: emailRecord.recipientEmail,
    subject: emailRecord.subject,
    scheduledTimestamp: scheduledTime.getTime(),
    hourlyLimit: 200,
    minDelayMs: 500,
  }, 0);

  console.log('  Job enqueued into BullMQ. Waiting for worker dispatch...');

  // Poll database until status transitions to SENT (up to 15 seconds)
  let attempts = 0;
  let sentRecord = null;
  while (attempts < 30) {
    await new Promise((res) => setTimeout(res, 500));
    sentRecord = await prisma.emailRecord.findUnique({
      where: { id: emailRecord.id },
    });

    if (sentRecord?.status === 'SENT') {
      break;
    }
    attempts++;
  }

  if (!sentRecord || sentRecord.status !== 'SENT') {
    throw new Error(`Email failed to reach SENT state within timeout. Current status: ${sentRecord?.status}, lastError: ${sentRecord?.lastError}`);
  }

  console.log(`  Email successfully delivered!`);
  console.log(`  - Status: ${sentRecord.status}`);
  console.log(`  - SMTP Message-ID: ${sentRecord.smtpMessageId}`);
  console.log(`  - Ethereal URL: ${sentRecord.etherealUrl}`);
  console.log(`  - Sent At: ${sentRecord.sentAt?.toISOString()}`);
  console.log('✅ TEST 2 PASSED: BullMQ worker dispatched email via Ethereal SMTP and updated PostgreSQL.\n');

  console.log('🎉 ALL PHASE 2 TESTS PASSED SUCCESSFULLY!');

  // Gracefully close connections
  await emailWorker.close();
  await redisClient.quit();
  await prisma.$disconnect();
  process.exit(0);
}

runPhase2Verification().catch((err) => {
  console.error('❌ Phase 2 Verification Failed:', err);
  process.exit(1);
});
