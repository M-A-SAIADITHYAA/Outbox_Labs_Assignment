import { PrismaClient, EmailStatus } from '@prisma/client';
import crypto from 'crypto';
import { enqueueEmailDispatchJob, EmailDispatchJobData } from '../queues/email.queue';
import { env } from '../config/env';

const prisma = new PrismaClient();

export interface RecipientInput {
  email: string;
  name?: string;
  metadata?: Record<string, any>;
}

export interface ScheduleBatchInput {
  userId: string;
  senderId: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  recipients: RecipientInput[];
  scheduledAt: Date;
  hourlyLimit?: number;
  delaySeconds?: number;
}

export class EmailService {
  /**
   * Schedules a batch of emails transactionally and pushes delayed jobs to BullMQ.
   */
  public static async scheduleBatch(input: ScheduleBatchInput) {
    const {
      userId,
      senderId,
      subject,
      bodyText,
      bodyHtml,
      recipients,
      scheduledAt,
      hourlyLimit = env.DEFAULT_MAX_EMAILS_PER_HOUR,
      delaySeconds = env.DEFAULT_MIN_DELAY_SECONDS,
    } = input;

    if (!recipients || recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    // Verify sender exists
    const sender = await prisma.senderIdentity.findFirst({
      where: { id: senderId },
    });

    if (!sender) {
      throw new Error(`Sender identity with ID ${senderId} not found`);
    }

    const scheduledTimestamp = scheduledAt.getTime();
    const now = Date.now();
    const baseDelayMs = Math.max(0, scheduledTimestamp - now);
    const interLeadDelayMs = delaySeconds * 1000;

    // Execute in PostgreSQL Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create parent Campaign
      const campaign = await tx.campaign.create({
        data: {
          userId,
          title: subject.slice(0, 100) || 'Untitled Campaign',
          totalLeads: recipients.length,
          scheduledCount: recipients.length,
          hourlyLimit,
          delaySeconds,
          scheduledAt,
        },
      });

      // 2. Prepare Email Records with staggered initial schedule times
      const emailRecordsData = recipients.map((r, index) => {
        // Stagger each lead by delaySeconds so BullMQ naturally spaces them
        const leadScheduledTime = new Date(scheduledTimestamp + index * interLeadDelayMs);
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${senderId}:${r.email.toLowerCase()}:${subject}:${leadScheduledTime.getTime()}`)
          .digest('hex');

        return {
          userId,
          senderId,
          campaignId: campaign.id,
          recipientEmail: r.email.toLowerCase().trim(),
          recipientName: r.name || null,
          subject,
          bodyText,
          bodyHtml: bodyHtml || null,
          scheduledAt: leadScheduledTime,
          status: EmailStatus.SCHEDULED,
          idempotencyKey,
          metadata: r.metadata ? JSON.parse(JSON.stringify(r.metadata)) : undefined,
        };
      });

      // Bulk create email records in PostgreSQL
      await tx.emailRecord.createMany({
        data: emailRecordsData,
        skipDuplicates: true,
      });

      // Retrieve inserted records to obtain generated UUIDs
      const createdEmails = await tx.emailRecord.findMany({
        where: { campaignId: campaign.id },
        select: { id: true, recipientEmail: true, scheduledAt: true },
      });

      return { campaign, createdEmails };
    });

    // 3. Register delayed jobs into BullMQ
    const enqueuePromises = result.createdEmails.map((email, index) => {
      const leadDelayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());
      const jobPayload: EmailDispatchJobData = {
        emailRecordId: email.id,
        senderId,
        recipientEmail: email.recipientEmail,
        subject,
        scheduledTimestamp: email.scheduledAt.getTime(),
        hourlyLimit,
        minDelayMs: interLeadDelayMs,
        campaignId: result.campaign.id,
      };

      return enqueueEmailDispatchJob(jobPayload, leadDelayMs);
    });

    await Promise.all(enqueuePromises);

    console.log(
      `📅 Successfully scheduled campaign ${result.campaign.id} with ${result.createdEmails.length} emails. First job delay: ${baseDelayMs}ms`
    );

    return {
      campaignId: result.campaign.id,
      totalScheduled: result.createdEmails.length,
      scheduledAt,
      firstRunInMs: baseDelayMs,
    };
  }

  /**
   * Retrieves paginated scheduled emails with optional search filtering.
   */
  public static async getScheduledEmails(params: {
    userId: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { userId, page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      userId,
      status: EmailStatus.SCHEDULED,
    };

    if (search) {
      whereClause.OR = [
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.emailRecord.findMany({
        where: whereClause,
        include: {
          sender: { select: { name: true, email: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.emailRecord.count({ where: whereClause }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves paginated sent emails with optional search filtering.
   */
  public static async getSentEmails(params: {
    userId: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { userId, page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      userId,
      status: EmailStatus.SENT,
    };

    if (search) {
      whereClause.OR = [
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.emailRecord.findMany({
        where: whereClause,
        include: {
          sender: { select: { name: true, email: true } },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.emailRecord.count({ where: whereClause }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Returns all active sender identities for a user.
   */
  public static async getSenders(userId: string) {
    return prisma.senderIdentity.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  }
}
