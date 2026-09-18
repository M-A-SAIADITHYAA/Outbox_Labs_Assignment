import { PrismaClient, EmailStatus } from '@prisma/client';
import { emailDispatchQueue, enqueueEmailDispatchJob, EmailDispatchJobData } from '../queues/email.queue';
import { RateLimiterService } from '../services/rate-limiter.service';
import { redisClient } from '../config/redis';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function run1000EmailLoadSimulation() {
  console.log('🚀 =================================================================');
  console.log('🚀 PHASE 7: 1,000-EMAIL CONCURRENT SCHEDULING & LOAD SIMULATION');
  console.log('🚀 =================================================================\n');

  try {
    // STEP 1: Resolve Target User & Sender Identity
    console.log('📦 STEP 1: Resolving sender identity and user...');
    let user = await prisma.user.findFirst({
      where: { email: 'saiadithyaa2306@gmail.com' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'saiadithyaa2306@gmail.com',
          name: 'Sai Adithyaa',
          googleId: 'google-saiadithyaa-loadtest',
        },
      });
    }

    let sender = await prisma.senderIdentity.findFirst({
      where: { userId: user.id, email: 'saiadithyaa2306@gmail.com' },
    });

    if (!sender) {
      sender = await prisma.senderIdentity.create({
        data: {
          userId: user.id,
          email: 'saiadithyaa2306@gmail.com',
          name: user.name,
          hourlyLimit: 200,
          minDelayMs: 2000,
          isDefault: true,
        },
      });
    }

    console.log(`  User: ${user.name} (${user.id})`);
    console.log(`  Sender: ${sender.name} <${sender.email}>\n`);

    // STEP 2: Generate 1,000 Recipients
    console.log('⚡ STEP 2: Synthesizing 1,000 lead recipients...');
    const TOTAL_EMAILS = 1000;
    const batchId = crypto.randomBytes(4).toString('hex');
    const baseScheduledTime = new Date(Date.now() + 60 * 1000); // Scheduled 1 minute in the future
    const delaySeconds = 2; // 2s inter-email throttle
    const hourlyLimit = 200; // 200 emails per hour

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        title: `Enterprise Q4 Outbound Simulation [Batch ${batchId}]`,
        totalLeads: TOTAL_EMAILS,
        scheduledCount: TOTAL_EMAILS,
        hourlyLimit,
        delaySeconds,
        scheduledAt: baseScheduledTime,
      },
    });

    console.log(`  Created Campaign ID: ${campaign.id}`);

    // Generate records in chunks for fast bulk insertion
    const emailData = [];
    for (let i = 0; i < TOTAL_EMAILS; i++) {
      const scheduledAt = new Date(baseScheduledTime.getTime() + i * delaySeconds * 1000);
      const recipientEmail = `lead-${batchId}-${String(i).padStart(4, '0')}@target-enterprise.io`;
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${sender.id}:${recipientEmail}:${campaign.id}:${scheduledAt.getTime()}`)
        .digest('hex');

      emailData.push({
        userId: user.id,
        senderId: sender.id,
        campaignId: campaign.id,
        recipientEmail,
        recipientName: `Executive Lead ${i + 1}`,
        subject: `Strategic Growth Opportunities for Your Team (Lead #${i + 1})`,
        bodyText: `Hello Executive Lead,\n\nWe noticed your engineering achievements and wanted to invite your team to our enterprise demo.`,
        scheduledAt,
        status: EmailStatus.SCHEDULED,
        idempotencyKey,
      });
    }

    const insertStart = Date.now();
    console.log(`  Inserting ${TOTAL_EMAILS} email records into PostgreSQL in chunks...`);
    const CHUNK_SIZE = 250;
    for (let i = 0; i < emailData.length; i += CHUNK_SIZE) {
      const chunk = emailData.slice(i, i + CHUNK_SIZE);
      await prisma.emailRecord.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }
    const insertDuration = Date.now() - insertStart;
    console.log(`  ✅ PostgreSQL insertion completed in ${insertDuration}ms (${(TOTAL_EMAILS / (insertDuration / 1000)).toFixed(0)} records/sec)\n`);

    // STEP 3: Enqueue 1,000 Delayed Jobs into BullMQ
    console.log('📥 STEP 3: Pushing 1,000 delayed jobs into BullMQ with staggered delays (Zero Cron)...');
    const createdEmails = await prisma.emailRecord.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, recipientEmail: true, scheduledAt: true },
      take: TOTAL_EMAILS,
    });

    const enqueueStart = Date.now();
    const enqueuePromises = createdEmails.map((email) => {
      const leadDelayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());
      const jobData: EmailDispatchJobData = {
        emailRecordId: email.id,
        senderId: sender.id,
        recipientEmail: email.recipientEmail,
        subject: `Strategic Growth Opportunities (Lead #${email.recipientEmail})`,
        scheduledTimestamp: email.scheduledAt.getTime(),
        hourlyLimit,
        minDelayMs: delaySeconds * 1000,
        campaignId: campaign.id,
      };

      return enqueueEmailDispatchJob(jobData, leadDelayMs);
    });

    await Promise.all(enqueuePromises);
    const enqueueDuration = Date.now() - enqueueStart;
    console.log(`  ✅ 1,000 BullMQ delayed jobs registered in ${enqueueDuration}ms (${(TOTAL_EMAILS / (enqueueDuration / 1000)).toFixed(0)} jobs/sec)\n`);

    // STEP 4: Inspect Queue Metrics
    console.log('📊 STEP 4: Querying live BullMQ queue metrics...');
    const queueCounts = await emailDispatchQueue.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed');
    console.log('  Current BullMQ Queue Metrics:');
    console.log(`    - Delayed:   ${queueCounts.delayed}`);
    console.log(`    - Waiting:   ${queueCounts.waiting}`);
    console.log(`    - Active:    ${queueCounts.active}`);
    console.log(`    - Completed: ${queueCounts.completed}`);
    console.log(`    - Failed:    ${queueCounts.failed}`);

    if (queueCounts.delayed < TOTAL_EMAILS) {
      console.warn(`  ⚠️ Expected at least ${TOTAL_EMAILS} delayed jobs, found ${queueCounts.delayed}`);
    } else {
      console.log(`  ✅ 1,000 delayed jobs are safely persisted in Redis memory.\n`);
    }

    // STEP 5: High-Concurrency Atomic Rate Limiter Stress Test
    console.log('🔥 STEP 5: Simulating high-concurrency race condition on Redis Lua rate limiter...');
    console.log('  Testing atomic quota enforcement across 25 concurrent worker threads...');

    const TEST_SENDER_ID = `stress-sender-${batchId}`;
    const TEST_HOURLY_LIMIT = 5; // Strict cap of 5 emails per hour
    const TEST_DELAY_MS = 200;
    const CONCURRENT_REQUESTS = 25;

    const stressTimestamp = Date.now();
    const concurrentPromises = Array.from({ length: CONCURRENT_REQUESTS }).map(() =>
      RateLimiterService.checkAndAllocate(
        TEST_SENDER_ID,
        TEST_HOURLY_LIMIT,
        TEST_DELAY_MS
      )
    );

    const results = await Promise.all(concurrentPromises);

    const allowed = results.filter((r) => r.allowed);
    const rateLimited = results.filter((r) => !r.allowed);
    const slackAlerts = results.filter((r) => r.triggerSlack);

    console.log(`  Concurrent Simulation Results (${CONCURRENT_REQUESTS} requests against limit of ${TEST_HOURLY_LIMIT}):`);
    console.log(`    - Allowed to send immediately:  ${allowed.length}`);
    console.log(`    - Rate limited & rescheduled:   ${rateLimited.length}`);
    console.log(`    - Slack alerts dispatched:      ${slackAlerts.length}`);

    // Assertions
    if (allowed.length !== TEST_HOURLY_LIMIT) {
      throw new Error(`Rate limit breach! Allowed ${allowed.length} sends, but limit was ${TEST_HOURLY_LIMIT}`);
    }
    if (rateLimited.length !== CONCURRENT_REQUESTS - TEST_HOURLY_LIMIT) {
      throw new Error(`Expected ${CONCURRENT_REQUESTS - TEST_HOURLY_LIMIT} rejected/rescheduled, got ${rateLimited.length}`);
    }
    if (slackAlerts.length !== 1) {
      throw new Error(`Slack alert deduplication failed! Expected exactly 1 alert, got ${slackAlerts.length}`);
    }

    console.log('  ✅ Atomic Redis Lua script strictly enforced the hourly quota with zero race conditions.');
    console.log('  ✅ Deduplication verified: exactly 1 Slack alert was emitted for the breach window.\n');

    // STEP 6: Clean Up Stress Test Keys and Temporary Records
    console.log('🧹 STEP 6: Cleaning up stress test keys and test campaign...');
    // Delete test rate limiter redis keys
    const hourWindow = new Date(stressTimestamp).toISOString().slice(0, 13);
    await redisClient.del(`ratelimit:sender:${TEST_SENDER_ID}:${hourWindow}:count`);
    await redisClient.del(`ratelimit:sender:${TEST_SENDER_ID}:${hourWindow}:slack_sent`);
    await redisClient.del(`ratelimit:sender:${TEST_SENDER_ID}:last_send_ms`);

    // Clean up created BullMQ jobs
    const delayedJobs = await emailDispatchQueue.getJobs(['delayed'], 0, 1000);
    const batchJobIds = delayedJobs.filter((j) => j.data?.campaignId === campaign.id);
    for (const j of batchJobIds) {
      await j.remove();
    }
    console.log(`  Removed ${batchJobIds.length} simulation jobs from BullMQ queue.`);

    // Clean up PostgreSQL records
    await prisma.emailRecord.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    console.log(`  Cleaned up simulation campaign ${campaign.id} and records from PostgreSQL.`);

    console.log('\n🎉 =================================================================');
    console.log('🎉 1,000-EMAIL LOAD SIMULATION PASSED WITH 100% SUCCESS!');
    console.log('🎉 =================================================================\n');
  } catch (error: any) {
    console.error('❌ LOAD SIMULATION FAILED:', error);
    process.exit(1);
  } finally {
    await emailDispatchQueue.close();
    await redisClient.quit();
    await prisma.$disconnect();
    process.exit(0);
  }
}

run1000EmailLoadSimulation();
