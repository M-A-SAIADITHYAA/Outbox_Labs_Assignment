import { Worker, Job } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';
import { EMAIL_INDEXING_QUEUE_NAME, EmailIndexingJobData } from '../queues/indexing.queue';
import { ElasticsearchService } from '../services/elasticsearch.service';

export const indexingWorker = new Worker<EmailIndexingJobData>(
  EMAIL_INDEXING_QUEUE_NAME,
  async (job: Job<EmailIndexingJobData>) => {
    const { emailRecordId, action } = job.data;
    console.log(`[ES Worker] 📥 Processing indexing job for ${emailRecordId} (${action})`);

    if (action === 'delete') {
      await ElasticsearchService.deleteEmailDocument(emailRecordId);
      return { success: true, action: 'deleted' };
    }

    const success = await ElasticsearchService.indexEmailDocument(emailRecordId);
    if (!success) {
      console.warn(`[ES Worker] ⚠️ Skipped indexing for document ${emailRecordId} (not found in database)`);
      return { success: false, reason: 'not_found' };
    }

    console.log(`[ES Worker] 🔎 Document ${emailRecordId} indexed successfully.`);
    return { success: true, action: 'indexed' };
  },
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  }
);

indexingWorker.on('completed', (job) => {
  console.log(`[ES Worker] ✨ Indexing job ${job.id} completed`);
});

indexingWorker.on('failed', (job, err) => {
  console.error(`[ES Worker] 💥 Indexing job ${job?.id} failed:`, err.message);
});
