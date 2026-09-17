import { Queue, JobsOptions } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';

export const EMAIL_DISPATCH_QUEUE_NAME = 'email-dispatch-queue';

export interface EmailDispatchJobData {
  emailRecordId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  scheduledTimestamp: number;
  hourlyLimit: number;
  minDelayMs: number;
  campaignId?: string;
}

export const emailDispatchQueue = new Queue<EmailDispatchJobData>(EMAIL_DISPATCH_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 5000,
      age: 72 * 3600, // 72 hours
    },
  },
});

/**
 * Enqueues an email dispatch job with a specified delay and deterministic job ID.
 */
export async function enqueueEmailDispatchJob(
  data: EmailDispatchJobData,
  delayMs: number = 0
) {
  const jobId = `dispatch-${data.emailRecordId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const jobOptions: JobsOptions = {
    jobId,
    delay: Math.max(0, delayMs),
  };

  const job = await emailDispatchQueue.add('send-email', data, jobOptions);
  return job;
}
