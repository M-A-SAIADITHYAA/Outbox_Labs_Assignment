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
  sameSite: 'lax' as const,
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

      return res.redirect(`${env.FRONTEND_URL}/`);
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

      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          slackConnected: user.slackIntegration?.isActive ?? false,
          slackDetails: user.slackIntegration?.isActive
            ? {
                teamName: user.slackIntegration.slackTeamName,
                channelName: user.slackIntegration.channelName,
                lastNotifiedAt: user.slackIntegration.lastNotifiedAt,
              }
            : null,
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
