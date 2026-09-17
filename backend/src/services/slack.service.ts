import { PrismaClient } from '@prisma/client';
import { CryptoService } from './crypto.service';

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
      const integration = await prisma.slackIntegration.findUnique({
        where: { userId },
      });

      if (!integration || !integration.isActive || !integration.incomingWebhook) {
        console.log(`ℹ️ Slack notification skipped: User ${userId} has no active Slack webhook.`);
        return false;
      }

      // Decrypt incoming webhook URL using AES-256-GCM
      let webhookUrl = integration.incomingWebhook;
      if (webhookUrl.includes(':')) {
        try {
          webhookUrl = CryptoService.decrypt(webhookUrl);
        } catch {
          // If already plain text (e.g. legacy test data)
        }
      }

      const formattedTime = nextWindow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const payload = {
        text: `🚨 *ReachInbox Rate Limit Alert*: Sender \`${senderEmail}\` reached hourly cap of ${hourlyLimit} emails. Remaining jobs rescheduled to ${formattedTime}.`,
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
                text: `*Next Available Window:*\n${formattedTime}`,
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

      await prisma.slackIntegration.update({
        where: { id: integration.id },
        data: { lastNotifiedAt: new Date() },
      });

      console.log(`📢 Successfully posted rate limit alert to Slack for sender ${senderEmail}`);
      return true;
    } catch (err) {
      console.error('❌ Error sending Slack rate limit notification:', err);
      return false;
    }
  }
}
