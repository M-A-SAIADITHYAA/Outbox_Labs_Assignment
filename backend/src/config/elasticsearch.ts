import { Client } from '@opensearch-project/opensearch';
import { env } from './env';

export const esClient = new Client({
  node: env.ELASTICSEARCH_NODE,
  requestTimeout: 5000,
  maxRetries: 3,
});

export const EMAIL_INDEX_NAME = env.ELASTICSEARCH_INDEX || 'reachinbox-emails';

/**
 * Ensures the Elasticsearch/OpenSearch index and mapping exist on startup.
 */
export async function ensureIndexExists(): Promise<boolean> {
  try {
    const res = await esClient.indices.exists({ index: EMAIL_INDEX_NAME });
    const exists = typeof res.body === 'boolean' ? res.body : Boolean(res.body);

    if (!exists) {
      console.log(`🔍 Search index "${EMAIL_INDEX_NAME}" does not exist. Creating with schema...`);

      await esClient.indices.create({
        index: EMAIL_INDEX_NAME,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              senderName: { type: 'text' },
              recipientEmail: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              recipientName: { type: 'text' },
              subject: {
                type: 'text',
                analyzer: 'standard',
              },
              bodyText: {
                type: 'text',
                analyzer: 'english',
              },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        },
      });

      console.log(`✅ Search index "${EMAIL_INDEX_NAME}" created successfully.`);
    } else {
      console.log(`✅ Search index "${EMAIL_INDEX_NAME}" is ready.`);
    }
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Could not initialize search index "${EMAIL_INDEX_NAME}":`, err.message);
    return false;
  }
}
