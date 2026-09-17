import { app } from './app';
import { env } from './config/env';
import { emailWorker } from './workers/email.worker';
import { indexingWorker } from './workers/indexing.worker';
import { redisClient } from './config/redis';
import { PrismaClient } from '@prisma/client';
import { ensureIndexExists } from './config/elasticsearch';

const prisma = new PrismaClient();

const server = app.listen(env.PORT, async () => {
  console.log(`\n🚀 ReachInbox Backend Server running on http://localhost:${env.PORT}`);
  console.log(`📊 Bull-Board Queue Dashboard mounted at http://localhost:${env.PORT}/admin/queues`);
  console.log(`🩺 Healthcheck available at http://localhost:${env.PORT}/api/health\n`);

  // Initialize search index
  await ensureIndexExists();
});

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);

  server.close(async () => {
    console.log('HTTP server closed.');

    try {
      console.log('Closing BullMQ workers...');
      await Promise.all([
        emailWorker.close(),
        indexingWorker.close(),
      ]);
      console.log('BullMQ workers closed.');

      console.log('Closing Redis connection...');
      await redisClient.quit();
      console.log('Redis disconnected.');

      console.log('Disconnecting Prisma...');
      await prisma.$disconnect();
      console.log('Database disconnected.');

      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown if taking longer than 10 seconds
  setTimeout(() => {
    console.error('Forcefully terminating process due to shutdown timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
