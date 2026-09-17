import { Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { env, getFrontendUrl } from '../config/env';
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
      return res.status(400).redirect(`${getFrontendUrl()}/?slack=error&msg=missing_code_or_state`);
    }

    try {
      // 1. Validate CSRF state from Redis
      const storedUserId = await redisClient.get(`slack:state:${state}`);
      if (!storedUserId) {
        console.warn('⚠️ Slack OAuth state mismatch or expired nonce:', state);
        return res.status(400).redirect(`${getFrontendUrl()}/?slack=error&msg=invalid_state`);
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
        return res.redirect(`${getFrontendUrl()}/?slack=error&msg=${encodeURIComponent(data.error)}`);
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
      return res.redirect(`${getFrontendUrl()}/?slack=connected`);
    } catch (err: any) {
      console.error('❌ Error handling Slack callback:', err);
      return res.redirect(`${getFrontendUrl()}/?slack=error&msg=internal_error`);
    }
  }

  /**
   * GET /api/slack/status
   */
  public static async getStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      let integration = await prisma.slackIntegration.findUnique({
        where: { userId },
      });

      if (!integration || !integration.isActive) {
        integration = await prisma.slackIntegration.findFirst({
          where: { isActive: true },
        });
      }

      if (!integration || !integration.isActive) {
        if (env.SLACK_WEBHOOK_URL) {
          return res.json({
            connected: true,
            teamName: 'Slack Workspace',
            channelName: '#general',
            lastNotifiedAt: null,
          });
        }
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

  /**
   * POST /api/slack/webhook
   * Allows saving an incoming webhook URL directly (ideal for testing and custom webhooks).
   */
  public static async saveWebhook(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      const { webhookUrl, channelName = '#rate-limit-alerts' } = req.body;

      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://hooks.slack.com/')) {
        return res.status(400).json({ error: 'Valid Slack webhook URL is required (must start with https://hooks.slack.com/)' });
      }

      const encryptedWebhook = CryptoService.encrypt(webhookUrl.trim());

      await prisma.slackIntegration.upsert({
        where: { userId },
        update: {
          incomingWebhook: encryptedWebhook,
          channelName,
          slackTeamName: 'Slack Alerts Channel',
          isActive: true,
        },
        create: {
          userId,
          slackTeamId: 'manual-team',
          slackTeamName: 'Slack Alerts Channel',
          slackUserId: 'manual-user',
          accessToken: CryptoService.encrypt('manual-token'),
          incomingWebhook: encryptedWebhook,
          channelName,
          isActive: true,
        },
      });

      console.log(`🔗 Direct Slack webhook configured for user ${userId}`);
      return res.json({ success: true, message: 'Slack webhook saved and activated' });
    } catch (err: any) {
      console.error('Error saving Slack webhook:', err);
      return res.status(500).json({ error: err.message || 'Failed to save Slack webhook' });
    }
  }

  /**
   * POST /api/slack/test-alert
   * Sends an immediate test rate limit alert to verify Slack connectivity.
   */
  public static async testAlert(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      const { SlackService } = await import('../services/slack.service');
      const nextWindow = new Date(Date.now() + 3600000);

      const success = await SlackService.notifyRateLimitBreach(
        userId,
        'oliver.brown@domain.io',
        200,
        nextWindow
      );

      if (!success) {
        return res.status(400).json({ error: 'Failed to send test alert. Please verify your webhook URL.' });
      }

      return res.json({ success: true, message: 'Test rate limit alert sent to Slack!' });
    } catch (err: any) {
      console.error('Error sending test alert:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}
