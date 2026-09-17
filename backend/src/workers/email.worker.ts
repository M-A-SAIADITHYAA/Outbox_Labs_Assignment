import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { env } from '../config/env';
import { redisConnectionOptions } from '../config/redis';
import { EMAIL_DISPATCH_QUEUE_NAME, EmailDispatchJobData, enqueueEmailDispatchJob } from '../queues/email.queue';
import { enqueueIndexingJob } from '../queues/indexing.queue';
import { RateLimiterService } from '../services/rate-limiter.service';
import { sendEmail } from '../config/smtp';
import { SlackService } from '../services/slack.service';

const prisma = new PrismaClient();
const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

export const emailWorker = new Worker<EmailDispatchJobData>(
  EMAIL_DISPATCH_QUEUE_NAME,
  async (job: Job<EmailDispatchJobData>, token?: string) => {
    const { emailRecordId, senderId, hourlyLimit, minDelayMs } = job.data;
    console.log(`[${WORKER_ID}] 🔄 Processing job ${job.id} for email ${emailRecordId}`);

    // 1. Fetch record and verify existence
    const emailRecord = await prisma.emailRecord.findUnique({
      where: { id: emailRecordId },
      include: { sender: true, user: true },
    });

    if (!emailRecord) {
      console.warn(`[${WORKER_ID}] ⚠️ Email record ${emailRecordId} not found in DB. Skipping.`);
      return { skipped: true, reason: 'NOT_FOUND' };
    }

    // Idempotency: Skip if already sent or cancelled
    if (emailRecord.status === 'SENT' || emailRecord.status === 'CANCELLED') {
      console.log(`[${WORKER_ID}] ⏭️ Email ${emailRecordId} is already in terminal state ${emailRecord.status}.`);
      return { skipped: true, status: emailRecord.status };
    }

    // 2. Acquire lease lock (SCHEDULED or FAILED -> DISPATCHING)
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 30000); // 30-second lease

    const lockResult = await prisma.emailRecord.updateMany({
      where: {
        id: emailRecordId,
        OR: [
          { status: { in: ['SCHEDULED', 'FAILED'] } },
          { status: 'DISPATCHING', lockExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'DISPATCHING',
        lockToken: WORKER_ID,
        lockExpiresAt: leaseExpiresAt,
      },
    });

    if (lockResult.count === 0) {
      console.warn(`[${WORKER_ID}] 🔒 Could not acquire lock for ${emailRecordId}. Currently handled by another worker.`);
      return { skipped: true, reason: 'LOCKED' };
    }

    try {
      // 3. Evaluate Atomic Rate Limiter
      const limitResult = await RateLimiterService.checkAndAllocate(
        senderId,
        hourlyLimit || emailRecord.sender.hourlyLimit || env.DEFAULT_MAX_EMAILS_PER_HOUR,
        minDelayMs || emailRecord.sender.minDelayMs || env.DEFAULT_MIN_DELAY_SECONDS * 1000
      );

      // Case A: Hourly rate limit exceeded -> Reschedule to next hour
      if (!limitResult.allowed) {
        const nextHourTimestamp = limitResult.nextWindowTimestamp || Date.now() + 3600000;
        const nextWindowDate = new Date(nextHourTimestamp);
        const delayUntilNextHour = Math.max(1000, nextHourTimestamp - Date.now());
        // Add random micro-jitter (0 to 500ms) to avoid thundering herd at top of the hour
        const jitter = Math.floor(Math.random() * 500);

        console.log(
          `[${WORKER_ID}] ⏳ Rate limit reached for sender ${emailRecord.sender.email} (${limitResult.currentCount}/${hourlyLimit}). Rescheduling email ${emailRecordId} to ${nextWindowDate.toISOString()}`
        );

        // Record audit log entry
        const hourWindowString = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
        await prisma.rateLimitAuditLog.create({
          data: {
            senderId,
            hourWindow: hourWindowString,
            count: limitResult.currentCount,
            limit: hourlyLimit,
            slackNotified: limitResult.triggerSlack,
          },
        });

        // Trigger live Slack alert on the very first breach of this window
        if (limitResult.triggerSlack) {
          await SlackService.notifyRateLimitBreach(
            emailRecord.userId,
            emailRecord.sender.email,
            hourlyLimit,
            nextWindowDate
          );
        }

        // Release lock & update scheduledAt in PostgreSQL
        await prisma.emailRecord.update({
          where: { id: emailRecordId },
          data: {
            status: 'SCHEDULED',
            scheduledAt: nextWindowDate,
            lockToken: null,
            lockExpiresAt: null,
          },
        });

        // Re-enqueue delayed job into BullMQ
        await enqueueEmailDispatchJob(job.data, delayUntilNextHour + jitter);

        return {
          rescheduled: true,
          nextWindow: nextWindowDate.toISOString(),
          delayMs: delayUntilNextHour + jitter,
        };
      }

      // Case B: Rate limit OK -> Enforce minimum delay throttle
      if (limitResult.waitMs > 0) {
        console.log(`[${WORKER_ID}] ⏱️ Throttling send by ${limitResult.waitMs}ms to respect inter-email delay...`);
        await new Promise((res) => setTimeout(res, limitResult.waitMs));
      }

      // 4. Generate deterministic Message-ID for MTA deduplication
      const deterministicMessageId = `<${emailRecord.id}-${emailRecord.scheduledAt.getTime()}@${emailRecord.sender.email.split('@')[1] || 'reachinbox.internal'}>`;

      // 5. Send email via Ethereal SMTP
      console.log(`[${WORKER_ID}] 🚀 Dispatching email to ${emailRecord.recipientEmail} via Ethereal SMTP...`);
      const sendResult = await sendEmail({
        from: `"${emailRecord.sender.name}" <${emailRecord.sender.email}>`,
        to: emailRecord.recipientEmail,
        subject: emailRecord.subject,
        text: emailRecord.bodyText,
        html: emailRecord.bodyHtml || undefined,
        messageId: deterministicMessageId,
      });

      console.log(`[${WORKER_ID}] ✅ Email accepted by SMTP. ID: ${sendResult.messageId}`);
      if (sendResult.previewUrl) {
        console.log(`[${WORKER_ID}] 🔗 Ethereal Preview: ${sendResult.previewUrl}`);
      }

      // 6. Update database record to terminal SENT
      await prisma.emailRecord.update({
        where: { id: emailRecordId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          smtpMessageId: sendResult.messageId,
          etherealUrl: typeof sendResult.previewUrl === 'string' ? sendResult.previewUrl : null,
          lockToken: null,
          lockExpiresAt: null,
          lastError: null,
        },
      });

      // Update Campaign metrics if associated
      if (emailRecord.campaignId) {
        await prisma.campaign.update({
          where: { id: emailRecord.campaignId },
          data: {
            sentCount: { increment: 1 },
          },
        });
      }

      // 7. Update search index with SENT status
      await enqueueIndexingJob(emailRecordId, 'index').catch((err) => {
        console.warn(`[ES] Failed to enqueue search update for sent email ${emailRecordId}:`, err.message);
      });

      return {
        success: true,
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl,
      };
    } catch (error: any) {
      console.error(`[${WORKER_ID}] ❌ Error dispatching email ${emailRecordId}:`, error);

      // Record failure in PostgreSQL
      await prisma.emailRecord.update({
        where: { id: emailRecordId },
        data: {
          status: 'FAILED',
          lastError: error.message || 'Unknown SMTP error',
          retryCount: { increment: 1 },
          lockToken: null,
          lockExpiresAt: null,
        },
      });

      if (emailRecord.campaignId) {
        await prisma.campaign.update({
          where: { id: emailRecord.campaignId },
          data: { failedCount: { increment: 1 } },
        });
      }

      // Rethrow to trigger BullMQ exponential retry
      throw error;
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: env.WORKER_CONCURRENCY,
    stalledInterval: 30000,
    maxStalledCount: 2,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] ✨ Job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] 💥 Job ${job?.id} failed with error:`, err.message);
});
