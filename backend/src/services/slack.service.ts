import { PrismaClient } from '@prisma/client';
import { CryptoService } from './crypto.service';
import { env } from '../config/env';

const prisma = new PrismaClient();

export class SlackService {
  /**
   * Triggers a live Slack webhook notification when a sender breaches their hourly rate limit.
   */
  public static async notifyRateLimitBreach(
    userId: string,
    senderEmail: string,
    hourlyLimit: number,
    nextWindow: Date
  ): Promise<boolean> {
    try {
      let integration = await prisma.slackIntegration.findUnique({
        where: { userId },
      });

      if (!integration || !integration.isActive || !integration.incomingWebhook) {
        integration = await prisma.slackIntegration.findFirst({
          where: { isActive: true, incomingWebhook: { not: null } },
        });
      }

      let webhookUrl = integration?.incomingWebhook || env.SLACK_WEBHOOK_URL;

      if (!webhookUrl) {
        console.log(`ℹ️ Slack notification skipped: No active Slack webhook found for user ${userId}.`);
        return false;
      }

      // Decrypt incoming webhook URL using AES-256-GCM if encrypted
      if (webhookUrl.includes(':') && !webhookUrl.startsWith('https://hooks.slack.com/')) {
        try {
          webhookUrl = CryptoService.decrypt(webhookUrl);
        } catch {
          // If already plain text
        }
      }

      const epochSeconds = Math.floor(nextWindow.getTime() / 1000);
      const istTime = nextWindow.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      const utcTime = nextWindow.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
      const localizedSlackTime = `<!date^${epochSeconds}^{time}|${istTime} IST> (${istTime} IST / ${utcTime} UTC)`;

      const payload = {
        text: `🚨 *ReachInbox Rate Limit Alert*: Sender \`${senderEmail}\` reached hourly cap of ${hourlyLimit} emails. Remaining jobs rescheduled to ${istTime} IST (${utcTime} UTC).`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Hourly Email Limit Reached',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Sender:*\n${senderEmail}`,
              },
              {
                type: 'mrkdwn',
                text: `*Hourly Quota:*\n${hourlyLimit} emails/hr`,
              },
              {
                type: 'mrkdwn',
                text: `*Next Available Window:*\n${localizedSlackTime}`,
              },
              {
                type: 'mrkdwn',
                text: `*Action Taken:*\nJobs automatically delayed`,
              },
            ],
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`❌ Slack webhook returned status ${response.status}`);
        return false;
      }

      if (integration?.id) {
        await prisma.slackIntegration.update({
          where: { id: integration.id },
          data: { lastNotifiedAt: new Date() },
        });
      }

      console.log(`📢 Successfully posted rate limit alert to Slack for sender ${senderEmail}`);
      return true;
    } catch (err) {
      console.error('❌ Error sending Slack rate limit notification:', err);
      return false;
    }
  }
}
