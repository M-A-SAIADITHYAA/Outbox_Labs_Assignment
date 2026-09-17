import request from 'supertest';
import { app } from '../app';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../config/redis';
import { emailDispatchQueue } from '../queues/email.queue';

const prisma = new PrismaClient();

async function runPhase3Verification() {
  console.log('🧪 ===================================================');
  console.log('🧪 RUNNING PHASE 3 VERIFICATION TEST SUITE (REST APIs & Bull-Board)');
  console.log('🧪 ===================================================\n');

  // TEST 1: Healthcheck API
  console.log('🔬 TEST 1: Verifying GET /api/health...');
  const healthRes = await request(app).get('/api/health');
  console.log(`  Health Response (${healthRes.status}):`, healthRes.body);
  if (healthRes.status !== 200 || healthRes.body.status !== 'ok') {
    throw new Error(`Healthcheck failed with status ${healthRes.status}`);
  }
  console.log('✅ TEST 1 PASSED: Healthcheck endpoint is healthy.\n');

  // TEST 2: Senders Endpoint
  console.log('🔬 TEST 2: Verifying GET /api/senders...');
  const sendersRes = await request(app).get('/api/senders');
  console.log(`  Senders count: ${sendersRes.body.senders?.length}`);
  if (sendersRes.status !== 200 || !sendersRes.body.senders || sendersRes.body.senders.length === 0) {
    throw new Error('Failed to retrieve sender identities');
  }
  const defaultSender = sendersRes.body.senders[0];
  console.log(`  Default Sender: ${defaultSender.name} <${defaultSender.email}> (ID: ${defaultSender.id})`);
  console.log('✅ TEST 2 PASSED: Senders retrieved successfully.\n');

  // TEST 3: Batch Schedule API
  console.log('🔬 TEST 3: Verifying POST /api/emails/schedule...');
  const schedulePayload = {
    senderId: defaultSender.id,
    subject: 'Phase 3 API Automated Test Campaign',
    bodyText: 'Hello from Phase 3 automated integration test! This email was scheduled via REST API.',
    recipients: [
      { email: 'recipient1@example.com', name: 'Recipient One' },
      { email: 'recipient2@example.com', name: 'Recipient Two' },
    ],
    scheduledAt: new Date(Date.now() + 60000).toISOString(), // 1 minute in future
    hourlyLimit: 150,
    delaySeconds: 2,
  };

  const scheduleRes = await request(app)
    .post('/api/emails/schedule')
    .send(schedulePayload);

  console.log(`  Schedule Response (${scheduleRes.status}):`, scheduleRes.body);
  if (scheduleRes.status !== 201 || scheduleRes.body.totalScheduled !== 2) {
    throw new Error(`Schedule API failed: ${JSON.stringify(scheduleRes.body)}`);
  }
  console.log('✅ TEST 3 PASSED: Batch emails scheduled successfully.\n');

  // TEST 4: Query Scheduled Emails API
  console.log('🔬 TEST 4: Verifying GET /api/emails/scheduled...');
  const scheduledListRes = await request(app)
    .get('/api/emails/scheduled?limit=10')
    .query({ search: 'Phase 3' });

  console.log(`  Found ${scheduledListRes.body.items?.length} scheduled test emails.`);
  if (scheduledListRes.status !== 200 || scheduledListRes.body.items.length === 0) {
    throw new Error('Failed to list scheduled emails via GET /api/emails/scheduled');
  }
  console.log('✅ TEST 4 PASSED: Scheduled emails listed with pagination & search.\n');

  // TEST 5: Bull-Board UI Endpoint
  console.log('🔬 TEST 5: Verifying GET /admin/queues (Bull-Board Dashboard)...');
  const adminRes = await request(app).get('/admin/queues/');
  console.log(`  Bull-Board Response status: ${adminRes.status}`);
  if (adminRes.status !== 200 && adminRes.status !== 302) {
    throw new Error(`Bull-Board endpoint returned unexpected status ${adminRes.status}`);
  }
  console.log('✅ TEST 5 PASSED: Bull-Board monitoring dashboard is mounted and reachable.\n');

  console.log('🎉 ALL PHASE 3 TESTS PASSED SUCCESSFULLY!');

  // Clean up test campaign data from PostgreSQL to keep DB tidy
  await prisma.emailRecord.deleteMany({
    where: { campaignId: scheduleRes.body.campaignId },
  });
  await prisma.campaign.delete({
    where: { id: scheduleRes.body.campaignId },
  });
  await emailDispatchQueue.obliterate({ force: true });

  await redisClient.quit();
  await prisma.$disconnect();
  process.exit(0);
}

runPhase3Verification().catch((err) => {
  console.error('❌ Phase 3 Verification Failed:', err);
  process.exit(1);
});
