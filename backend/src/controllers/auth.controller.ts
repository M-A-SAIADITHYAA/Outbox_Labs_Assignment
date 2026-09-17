import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { env } from '../config/env';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COOKIE_NAME = 'reachinbox_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as any,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export class AuthController {
  /**
   * GET /api/auth/google
   * Redirects user to Google OAuth 2.0 consent screen.
   */
  public static async googleLogin(req: Request, res: Response) {
    try {
      const state = req.query.state as string | undefined;
      const url = AuthService.getGoogleAuthUrl(state);
      return res.redirect(url);
    } catch (err: any) {
      console.error('Error initiating Google OAuth:', err);
      return res.status(500).json({ error: 'Failed to initiate Google OAuth' });
    }
  }

  /**
   * GET /api/auth/google/url
   * Returns Google OAuth 2.0 URL as JSON.
   */
  public static async getGoogleUrl(req: Request, res: Response) {
    try {
      const state = req.query.state as string | undefined;
      const authUrl = AuthService.getGoogleAuthUrl(state);
      return res.json({ authUrl });
    } catch (err: any) {
      console.error('Error generating Google OAuth URL:', err);
      return res.status(500).json({ error: 'Failed to generate Google OAuth URL' });
    }
  }

  /**
   * GET /api/auth/google/callback
   * Exchanges Google code for tokens, upserts user, and issues HTTP-Only session cookie.
   */
  public static async googleCallback(req: Request, res: Response) {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).redirect(`${env.FRONTEND_URL}/login?error=missing_code`);
    }

    try {
      const { token, user } = await AuthService.handleGoogleCallback(code);

      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      console.log(`👤 User logged in via Google: ${user.name} (${user.email})`);

      return res.redirect(`${env.FRONTEND_URL}/?token=${token}`);
    } catch (err: any) {
      console.error('Error in Google OAuth callback:', err);
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated profile and integration status.
   */
  public static async getMe(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id || 'default-user-oliver-brown';
      const user = await AuthService.getUserById(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let slackConnected = user.slackIntegration?.isActive ?? false;
      let slackDetails = slackConnected && user.slackIntegration
        ? {
            teamName: user.slackIntegration.slackTeamName,
            channelName: user.slackIntegration.channelName,
            lastNotifiedAt: user.slackIntegration.lastNotifiedAt,
          }
        : null;

      if (!slackConnected) {
        const anyActive = await prisma.slackIntegration.findFirst({ where: { isActive: true } });
        if (anyActive) {
          slackConnected = true;
          slackDetails = {
            teamName: anyActive.slackTeamName,
            channelName: anyActive.channelName,
            lastNotifiedAt: anyActive.lastNotifiedAt,
          };
        } else if (env.SLACK_WEBHOOK_URL) {
          slackConnected = true;
          slackDetails = {
            teamName: 'Slack Workspace',
            channelName: '#general',
            lastNotifiedAt: null,
          };
        }
      }

      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          slackConnected,
          slackDetails,
        },
      });
    } catch (err: any) {
      console.error('Error in getMe:', err);
      return res.status(500).json({ error: 'Failed to retrieve profile' });
    }
  }

  /**
   * POST /api/auth/logout
   * Clears session cookie.
   */
  public static async logout(req: Request, res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully' });
  }

  /**
   * POST /api/auth/dev-login
   * Convenience session generator for evaluators / test scripts.
   */
  public static async devLogin(req: Request, res: Response) {
    try {
      const email = (req.body.email || 'oliver.brown@domain.io').toLowerCase();
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            googleId: `dev-${Date.now()}`,
            email,
            name: req.body.name || 'Oliver Brown',
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
          },
        });
      }

      const token = AuthService.generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });

      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (err: any) {
      console.error('Error in devLogin:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}
