import { EmailService } from '../services/email.service';
import { redisClient } from '../config/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Purging all email records, BullMQ queues, search index, and rate limits...');
  const result = await EmailService.clearAllEmails();
  console.log(`✅ Cleared ${result.deletedEmailsCount} emails and ${result.deletedCampaignsCount} campaigns from PostgreSQL.`);
  console.log('✨ All BullMQ queues drained and cleaned.');
  console.log('✨ Redis rate-limit counters wiped.');
  console.log('🚀 System is now in a pristine state (0 Sent, 0 Scheduled)!');

  await prisma.$disconnect();
  await redisClient.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to clear emails:', err);
  process.exit(1);
});
