import { Queue, JobsOptions } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';

export const EMAIL_INDEXING_QUEUE_NAME = 'email-indexing-queue';

export interface EmailIndexingJobData {
  emailRecordId: string;
  action: 'index' | 'delete';
}

export const emailIndexingQueue = new Queue<EmailIndexingJobData>(EMAIL_INDEXING_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: {
      count: 2000,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 5000,
      age: 72 * 3600,
    },
  },
});

/**
 * Enqueues an email document for asynchronous Elasticsearch indexing.
 */
export async function enqueueIndexingJob(
  emailRecordId: string,
  action: 'index' | 'delete' = 'index'
) {
  const jobId = `index-${action}-${emailRecordId}`;
  const options: JobsOptions = {
    jobId,
    // Deduplicate rapid updates to the same document
    removeOnComplete: true,
  };

  return emailIndexingQueue.add('index-email', { emailRecordId, action }, options);
}
