import { Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { redisClient } from '../config/redis';
import { CryptoService } from '../services/crypto.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export class SlackController {
  /**
   * GET /api/slack/install
   * Generates secure CSRF state token in Redis and redirects/returns Slack authorize URL.
   */
  public static async install(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      const stateNonce = crypto.randomBytes(24).toString('hex');

      // Store CSRF state nonce in Redis for 10 minutes
      await redisClient.set(`slack:state:${stateNonce}`, userId, 'EX', 600);

      const scopes = ['chat:write', 'incoming-webhook'].join(',');
      const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${encodeURIComponent(
        scopes
      )}&redirect_uri=${encodeURIComponent(env.SLACK_REDIRECT_URI)}&state=${stateNonce}`;

      if (req.headers.accept?.includes('application/json')) {
        return res.json({ authUrl: slackAuthUrl });
      }

      return res.redirect(slackAuthUrl);
    } catch (err: any) {
      console.error('Error in Slack install:', err);
      return res.status(500).json({ error: 'Failed to initiate Slack OAuth' });
    }
  }

  /**
   * GET /api/slack/callback
   * Verifies CSRF state, exchanges code for access token/webhook, and encrypts credentials.
   */
  public static async callback(req: Request, res: Response) {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      return res.status(400).redirect(`${env.FRONTEND_URL}/?slack=error&msg=missing_code_or_state`);
    }

    try {
      // 1. Validate CSRF state from Redis
      const storedUserId = await redisClient.get(`slack:state:${state}`);
      if (!storedUserId) {
        console.warn('⚠️ Slack OAuth state mismatch or expired nonce:', state);
        return res.status(400).redirect(`${env.FRONTEND_URL}/?slack=error&msg=invalid_state`);
      }

      // Invalidate state immediately to prevent replay attacks
      await redisClient.del(`slack:state:${state}`);

      // 2. Exchange authorization code for access token & incoming webhook
      const params = new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI,
      });

      const exchangeRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await exchangeRes.json() as any;

      if (!data.ok) {
        console.error('❌ Slack token exchange failed:', data.error);
        return res.redirect(`${env.FRONTEND_URL}/?slack=error&msg=${encodeURIComponent(data.error)}`);
      }

      // 3. Encrypt sensitive tokens with AES-256-GCM
      const encryptedAccessToken = CryptoService.encrypt(data.access_token);
      const incomingWebhookUrl = data.incoming_webhook?.url;
      const encryptedWebhook = incomingWebhookUrl ? CryptoService.encrypt(incomingWebhookUrl) : null;

      // 4. Upsert SlackIntegration in PostgreSQL
      await prisma.slackIntegration.upsert({
        where: { userId: storedUserId },
        update: {
          slackTeamId: data.team?.id || 'unknown-team',
          slackTeamName: data.team?.name || 'Slack Workspace',
          slackUserId: data.authed_user?.id || 'unknown-user',
          accessToken: encryptedAccessToken,
          incomingWebhook: encryptedWebhook,
          channelId: data.incoming_webhook?.channel_id || null,
          channelName: data.incoming_webhook?.channel || null,
          isActive: true,
        },
        create: {
          userId: storedUserId,
          slackTeamId: data.team?.id || 'unknown-team',
          slackTeamName: data.team?.name || 'Slack Workspace',
          slackUserId: data.authed_user?.id || 'unknown-user',
          accessToken: encryptedAccessToken,
          incomingWebhook: encryptedWebhook,
          channelId: data.incoming_webhook?.channel_id || null,
          channelName: data.incoming_webhook?.channel || null,
          isActive: true,
        },
      });

      console.log(`💬 Slack successfully connected for user ${storedUserId} (${data.team?.name})`);
      return res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
    } catch (err: any) {
      console.error('❌ Error handling Slack callback:', err);
      return res.redirect(`${env.FRONTEND_URL}/?slack=error&msg=internal_error`);
    }
  }

  /**
   * GET /api/slack/status
   */
  public static async getStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      const integration = await prisma.slackIntegration.findUnique({
        where: { userId },
      });

      if (!integration || !integration.isActive) {
        return res.json({ connected: false });
      }

      return res.json({
        connected: true,
        teamName: integration.slackTeamName,
        channelName: integration.channelName,
        lastNotifiedAt: integration.lastNotifiedAt,
      });
    } catch (err: any) {
      console.error('Error in Slack getStatus:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/slack/disconnect
   * Gracefully disables notifications without deleting historic audit entries.
   */
  public static async disconnect(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      await prisma.slackIntegration.updateMany({
        where: { userId },
        data: {
          isActive: false,
        },
      });

      console.log(`🔌 Slack disconnected for user ${userId}`);
      return res.json({ success: true, message: 'Slack disconnected successfully' });
    } catch (err: any) {
      console.error('Error in Slack disconnect:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}
