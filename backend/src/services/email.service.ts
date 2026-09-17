import { PrismaClient, EmailStatus } from '@prisma/client';
import crypto from 'crypto';
import { enqueueEmailDispatchJob, EmailDispatchJobData } from '../queues/email.queue';
import { enqueueIndexingJob } from '../queues/indexing.queue';
import { env } from '../config/env';

const prisma = new PrismaClient();

export interface RecipientInput {
  email: string;
  name?: string;
  metadata?: Record<string, any>;
}

export interface ScheduleBatchInput {
  userId: string;
  senderId?: string;
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

    // Verify sender exists, or auto-provision from user
    let sender = senderId
      ? await prisma.senderIdentity.findFirst({ where: { id: senderId } })
      : null;

    if (!sender) {
      sender = (await prisma.senderIdentity.findFirst({
        where: { userId, isDefault: true },
      })) || (await prisma.senderIdentity.findFirst({ where: { userId } }));
    }

    if (!sender) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      sender = await prisma.senderIdentity.create({
        data: {
          userId,
          email: user?.email || 'oliver.brown@domain.io',
          name: user?.name || 'Oliver Brown',
          hourlyLimit,
          minDelayMs: delaySeconds * 1000,
          isDefault: true,
        },
      });
    }

    // Update sender's dynamic limit if explicitly passed
    if (hourlyLimit && sender.hourlyLimit !== hourlyLimit) {
      await prisma.senderIdentity.update({
        where: { id: sender.id },
        data: { hourlyLimit, minDelayMs: delaySeconds * 1000 },
      });
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
          .update(`${sender.id}:${r.email.toLowerCase()}:${subject}:${leadScheduledTime.getTime()}`)
          .digest('hex');

        return {
          userId,
          senderId: sender.id,
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
        senderId: sender.id,
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

    // 4. Asynchronously enqueue background search indexing jobs
    result.createdEmails.forEach((email) => {
      enqueueIndexingJob(email.id, 'index').catch((err) => {
        console.warn(`[ES] Failed to enqueue initial index job for email ${email.id}:`, err.message);
      });
    });

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
    let senders = await prisma.senderIdentity.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });

    if (senders.length === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const newSender = await prisma.senderIdentity.create({
          data: {
            userId: user.id,
            email: user.email,
            name: user.name,
            hourlyLimit: env.DEFAULT_MAX_EMAILS_PER_HOUR,
            minDelayMs: env.DEFAULT_MIN_DELAY_SECONDS * 1000,
            isDefault: true,
          },
        });
        senders = [newSender];
      }
    }

    return senders;
  }

  /**
   * Retrieves a single email record by ID.
   */
  public static async getEmailById(emailId: string, userId: string) {
    return prisma.emailRecord.findFirst({
      where: { id: emailId, userId },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * Deletes an email record by ID and syncs deletion to search index.
   */
  public static async deleteEmail(emailId: string, userId: string) {
    const deleted = await prisma.emailRecord.deleteMany({
      where: { id: emailId, userId },
    });

    await enqueueIndexingJob(emailId, 'delete').catch((err) => {
      console.warn(`[ES] Failed to enqueue delete job for ${emailId}:`, err.message);
    });

    return deleted;
  }

  /**
   * Recovers and dispatches any overdue SCHEDULED emails from PostgreSQL.
   */
  public static async reconcileOverdueEmails(): Promise<number> {
    const now = new Date();
    // Release any stale DISPATCHING or FAILED locks back to SCHEDULED
    await prisma.emailRecord.updateMany({
      where: {
        status: { in: ['DISPATCHING', 'FAILED'] },
      },
      data: {
        status: 'SCHEDULED',
        lockToken: null,
        lockExpiresAt: null,
      },
    });

    // Find all SCHEDULED emails whose scheduled send time is <= now
    const overdueEmails = await prisma.emailRecord.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      include: { sender: true },
    });

    console.log(`[Reconciler] 🔄 Found ${overdueEmails.length} overdue scheduled emails in PostgreSQL.`);

    for (const email of overdueEmails) {
      await enqueueEmailDispatchJob({
        emailRecordId: email.id,
        senderId: email.senderId,
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        scheduledTimestamp: email.scheduledAt.getTime(),
        hourlyLimit: email.sender.hourlyLimit,
        minDelayMs: email.sender.minDelayMs,
      }, 0);
    }

    return overdueEmails.length;
  }
}
