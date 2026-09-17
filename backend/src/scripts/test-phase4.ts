import request from 'supertest';
import { app } from '../app';
import { CryptoService } from '../services/crypto.service';
import { AuthService } from '../services/auth.service';
import { SlackService } from '../services/slack.service';
import { redisClient } from '../config/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase4Verification() {
  console.log('🧪 ===================================================');
  console.log('🧪 RUNNING PHASE 4 VERIFICATION TEST SUITE (Auth & Slack)');
  console.log('🧪 ===================================================\n');

  // TEST 1: AES-256-GCM Token Encryption & Decryption
  console.log('🔬 TEST 1: Verifying AES-256-GCM Authenticated Encryption for Tokens...');
  const sampleWebhook = 'https://hooks.slack.com/services/T12345/B67890/abc123secretWebhookToken';
  const encrypted = CryptoService.encrypt(sampleWebhook);
  console.log(`  Original:  ${sampleWebhook}`);
  console.log(`  Encrypted: ${encrypted}`);
  const decrypted = CryptoService.decrypt(encrypted);
  console.log(`  Decrypted: ${decrypted}`);

  if (decrypted !== sampleWebhook) {
    throw new Error('Decrypted string does not match original text!');
  }
  console.log('✅ TEST 1 PASSED: AES-256-GCM encryption/decryption round-trip verified.\n');

  // TEST 2: Google OAuth URL Generation
  console.log('🔬 TEST 2: Verifying Google OAuth 2.0 URL generation...');
  const googleAuthUrl = AuthService.getGoogleAuthUrl('test-state-token');
  console.log(`  Generated Google Auth URL:\n  ${googleAuthUrl}`);
  if (
    !googleAuthUrl.includes('accounts.google.com') ||
    !googleAuthUrl.includes('scope=') ||
    !googleAuthUrl.includes('state=test-state-token')
  ) {
    throw new Error('Google Auth URL is malformed or missing parameters');
  }
  console.log('✅ TEST 2 PASSED: Google OAuth authorization URL generated correctly.\n');

  // TEST 3: JWT Session Generation and GET /api/auth/me
  console.log('🔬 TEST 3: Verifying JWT session cookie and GET /api/auth/me...');
  const devLoginRes = await request(app)
    .post('/api/auth/dev-login')
    .send({ email: 'oliver.brown@domain.io', name: 'Oliver Brown' });

  console.log(`  Dev Login Response (${devLoginRes.status}):`, devLoginRes.body);
  if (devLoginRes.status !== 200 || !devLoginRes.body.token) {
    throw new Error('Failed to generate session via dev login');
  }

  const cookieHeader = devLoginRes.headers['set-cookie']?.[0];
  console.log(`  Set-Cookie Header: ${cookieHeader?.slice(0, 45)}...`);

  // Query /api/auth/me with session cookie
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookieHeader || '');

  console.log(`  GET /api/auth/me (${meRes.status}):`, meRes.body);
  if (meRes.status !== 200 || meRes.body.user.email !== 'oliver.brown@domain.io') {
    throw new Error('Failed to retrieve user profile with session cookie');
  }
  console.log('✅ TEST 3 PASSED: Session JWT issued, verified, and profile hydrated.\n');

  // TEST 4: Slack Install & CSRF State Storage in Redis
  console.log('🔬 TEST 4: Verifying Slack OAuth install flow & CSRF state in Redis...');
  const slackInstallRes = await request(app)
    .get('/api/slack/install')
    .set('Accept', 'application/json');

  console.log(`  Slack Install Response:`, slackInstallRes.body);
  const slackUrl = slackInstallRes.body.authUrl;
  const stateMatch = slackUrl.match(/state=([a-f0-9]+)/);
  if (!stateMatch) {
    throw new Error('Slack authUrl does not contain state nonce');
  }
  const stateNonce = stateMatch[1];
  console.log(`  Extracted State Nonce: ${stateNonce}`);

  const redisUserId = await redisClient.get(`slack:state:${stateNonce}`);
  console.log(`  Redis verified user for state: ${redisUserId}`);
  if (!redisUserId) {
    throw new Error('State nonce was not found in Redis!');
  }

  // Verify that an invalid/expired state is rejected by callback
  const badCallbackRes = await request(app)
    .get('/api/slack/callback?code=bad_code&state=invalid_nonce_12345');
  console.log(`  Invalid state callback redirected to: ${badCallbackRes.headers.location}`);
  if (!badCallbackRes.headers.location?.includes('invalid_state')) {
    throw new Error('Slack callback did not reject invalid CSRF state!');
  }
  console.log('✅ TEST 4 PASSED: Slack CSRF state nonce generated, verified in Redis, and forged states rejected.\n');

  // TEST 5: Slack Disconnect & Zero-Crash Resilience
  console.log('🔬 TEST 5: Verifying Slack disconnect & resilient rate-limit breach handling...');
  const disconnectRes = await request(app).delete('/api/slack/disconnect');
  console.log(`  Disconnect status: ${disconnectRes.status}`, disconnectRes.body);
  if (disconnectRes.status !== 200 || !disconnectRes.body.success) {
    throw new Error('Failed to disconnect Slack');
  }

  // Call Slack notification for disconnected user - must return false without crashing
  const notifyResult = await SlackService.notifyRateLimitBreach(
    'default-user-oliver-brown',
    'oliver.brown@domain.io',
    200,
    new Date(Date.now() + 3600000)
  );
  console.log(`  Notification result for disconnected user: ${notifyResult} (Expected: false)`);
  if (notifyResult !== false) {
    throw new Error('notifyRateLimitBreach should gracefully return false when disconnected');
  }
  console.log('✅ TEST 5 PASSED: Slack disconnect handled gracefully with zero system crashes.\n');

  console.log('🎉 ALL PHASE 4 TESTS PASSED SUCCESSFULLY!');

  await redisClient.quit();
  await prisma.$disconnect();
  process.exit(0);
}

runPhase4Verification().catch((err) => {
  console.error('❌ Phase 4 Verification Failed:', err);
  process.exit(1);
});
