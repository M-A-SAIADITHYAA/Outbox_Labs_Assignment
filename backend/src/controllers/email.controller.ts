import { Request, Response } from 'express';
import { z } from 'zod';
import { EmailService } from '../services/email.service';

const scheduleBatchSchema = z.object({
  senderId: z.string().uuid('Invalid senderId format'),
  subject: z.string().min(1, 'Subject is required').max(500),
  bodyText: z.string().min(1, 'Email body is required'),
  bodyHtml: z.string().optional(),
  recipients: z
    .array(
      z.object({
        email: z.string().email('Invalid recipient email format'),
        name: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .min(1, 'At least one recipient is required')
    .max(5000, 'Maximum 5000 recipients per batch'),
  scheduledAt: z.string().datetime().or(z.date()).transform((val) => new Date(val)),
  hourlyLimit: z.number().int().positive().optional(),
  delaySeconds: z.number().int().nonnegative().optional(),
});

export class EmailController {
  /**
   * POST /api/emails/schedule
   */
  public static async scheduleBatch(req: Request, res: Response) {
    try {
      const parsed = scheduleBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      // Default to seeded Oliver Brown user if auth is not yet attached (in Phase 3)
      const userId = (req as any).user?.id || 'default-user-oliver-brown';

      const result = await EmailService.scheduleBatch({
        userId,
        ...parsed.data,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Error in scheduleBatch:', error);
      return res.status(500).json({
        error: error.message || 'Failed to schedule email batch',
      });
    }
  }

  /**
   * GET /api/emails/scheduled
   */
  public static async getScheduled(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 'default-user-oliver-brown';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const search = (req.query.search as string) || undefined;

      const result = await EmailService.getScheduledEmails({
        userId,
        page,
        limit,
        search,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Error in getScheduled:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/emails/sent
   */
  public static async getSent(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 'default-user-oliver-brown';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const search = (req.query.search as string) || undefined;

      const result = await EmailService.getSentEmails({
        userId,
        page,
        limit,
        search,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Error in getSent:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/senders
   */
  public static async getSenders(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 'default-user-oliver-brown';
      const senders = await EmailService.getSenders(userId);
      return res.json({ senders });
    } catch (error: any) {
      console.error('Error in getSenders:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
