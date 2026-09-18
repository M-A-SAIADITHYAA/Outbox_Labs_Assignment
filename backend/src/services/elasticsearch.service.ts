import { PrismaClient } from '@prisma/client';
import { esClient, EMAIL_INDEX_NAME } from '../config/elasticsearch';

const prisma = new PrismaClient();

export interface SearchEmailsParams {
  userId: string;
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  tookMs: number;
  engine: 'elasticsearch' | 'postgresql_fallback';
}

export class ElasticsearchService {
  /**
   * Indexes or updates an email document in Elasticsearch/OpenSearch from the database record.
   */
  public static async indexEmailDocument(emailRecordId: string): Promise<boolean> {
    try {
      const email = await prisma.emailRecord.findUnique({
        where: { id: emailRecordId },
        include: { sender: true },
      });

      if (!email) {
        console.warn(`[ES] Document ${emailRecordId} not found in PostgreSQL for indexing.`);
        return false;
      }

      const document = {
        id: email.id,
        userId: email.userId,
        senderId: email.senderId,
        senderEmail: email.sender.email,
        senderName: email.sender.name,
        recipientEmail: email.recipientEmail,
        recipientName: email.recipientName || '',
        subject: email.subject,
        bodyText: email.bodyText,
        status: email.status,
        scheduledAt: email.scheduledAt.toISOString(),
        sentAt: email.sentAt ? email.sentAt.toISOString() : null,
        createdAt: email.createdAt.toISOString(),
      };

      await esClient.index({
        index: EMAIL_INDEX_NAME,
        id: email.id,
        body: document,
        refresh: true, // Ensures immediate search visibility
      });

      return true;
    } catch (err: any) {
      // If Elasticsearch is offline or unreachable (e.g. cloud deployment without managed ES cluster)
      if (
        err.name === 'ConnectionError' ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.meta?.connection?.status === 'dead'
      ) {
        console.warn(`[ES] Elasticsearch offline or unreachable. Skipping background index; PostgreSQL fallback is active.`);
        return true; // Gracefully complete the BullMQ job so it doesn't fail
      }

      console.error(`[ES] Failed to index document ${emailRecordId}:`, err.message);
      throw err; // Allow BullMQ indexing worker to retry for other transient errors
    }
  }

  /**
   * Deletes an email document from Elasticsearch/OpenSearch.
   */
  public static async deleteEmailDocument(emailRecordId: string): Promise<boolean> {
    try {
      await esClient.delete({
        index: EMAIL_INDEX_NAME,
        id: emailRecordId,
        refresh: true,
      });
      return true;
    } catch (err: any) {
      // Ignore 404 not found or offline errors
      if (
        err.statusCode === 404 ||
        err.meta?.statusCode === 404 ||
        err.name === 'ConnectionError' ||
        err.message?.includes('ECONNREFUSED')
      ) {
        return true;
      }
      console.error(`[ES] Failed to delete document ${emailRecordId}:`, err.message);
      return false;
    }
  }

  /**
   * Clears all indexed documents from the search index.
   */
  public static async clearSearchIndex(): Promise<boolean> {
    try {
      await esClient.deleteByQuery({
        index: EMAIL_INDEX_NAME,
        body: {
          query: { match_all: {} },
        },
        refresh: true,
      });
      return true;
    } catch (err: any) {
      if (
        err.statusCode === 404 ||
        err.meta?.statusCode === 404 ||
        err.name === 'ConnectionError' ||
        err.message?.includes('ECONNREFUSED')
      ) {
        return true;
      }
      console.warn('[ES] Could not clear search index:', err.message);
      return false;
    }
  }

  /**
   * Full-text search across recipient, subject, and body with automatic PostgreSQL fallback.
   */
  public static async searchEmails(params: SearchEmailsParams): Promise<SearchEmailsResult> {
    const { userId, query, status, page = 1, limit = 20 } = params;
    const startTime = Date.now();
    const from = (page - 1) * limit;

    // 1. Attempt Primary: Elasticsearch / OpenSearch Search
    try {
      const filterClauses: any[] = [{ term: { userId } }];
      if (status) {
        filterClauses.push({ term: { status } });
      }

      const esQuery: any = {
        bool: {
          filter: filterClauses,
        },
      };

      if (query && query.trim().length > 0) {
        esQuery.bool.must = [
          {
            multi_match: {
              query: query.trim(),
              fields: ['subject^3', 'recipientEmail^2', 'recipientName^1.5', 'bodyText^1'],
              fuzziness: 'AUTO',
              operator: 'or',
            },
          },
        ];
      } else {
        esQuery.bool.must = [{ match_all: {} }];
      }

      const esResponse = await esClient.search({
        index: EMAIL_INDEX_NAME,
        from,
        size: limit,
        body: {
          query: esQuery,
          sort: [{ scheduledAt: { order: 'desc' } }],
        },
      });

      const hitsData = esResponse.body.hits;
      const totalHits =
        typeof hitsData.total === 'number'
          ? hitsData.total
          : hitsData.total?.value || 0;

      const items = (hitsData.hits || []).map((hit: any) => {
        const source = hit._source;
        return {
          id: source.id,
          recipientEmail: source.recipientEmail,
          recipientName: source.recipientName,
          subject: source.subject,
          bodyText: source.bodyText,
          status: source.status,
          scheduledAt: source.scheduledAt,
          sentAt: source.sentAt,
          sender: {
            name: source.senderName,
            email: source.senderEmail,
          },
        };
      });

      const tookMs = Date.now() - startTime;

      return {
        items,
        total: totalHits,
        page,
        limit,
        totalPages: Math.ceil(totalHits / limit),
        tookMs,
        engine: 'elasticsearch',
      };
    } catch (esError: any) {
      // 2. Graceful Fallback: PostgreSQL ILIKE Query
      console.warn('⚠️ Elasticsearch search failed or unreachable. Falling back to PostgreSQL:', esError.message);

      const whereClause: any = {
        userId,
      };

      if (status) {
        whereClause.status = status;
      }

      if (query && query.trim().length > 0) {
        whereClause.OR = [
          { subject: { contains: query.trim(), mode: 'insensitive' } },
          { recipientEmail: { contains: query.trim(), mode: 'insensitive' } },
          { recipientName: { contains: query.trim(), mode: 'insensitive' } },
          { bodyText: { contains: query.trim(), mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.emailRecord.findMany({
          where: whereClause,
          include: {
            sender: { select: { name: true, email: true } },
          },
          orderBy: { scheduledAt: 'desc' },
          skip: from,
          take: limit,
        }),
        prisma.emailRecord.count({ where: whereClause }),
      ]);

      const tookMs = Date.now() - startTime;

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        tookMs,
        engine: 'postgresql_fallback',
      };
    }
  }
}
