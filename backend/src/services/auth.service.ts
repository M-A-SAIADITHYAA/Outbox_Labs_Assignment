import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

const googleOAuthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL
);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export class AuthService {
  /**
   * Generates the Google OAuth 2.0 authorization URL.
   */
  public static getGoogleAuthUrl(state?: string): string {
    return googleOAuthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['openid', 'email', 'profile'],
      state: state || undefined,
    });
  }

  /**
   * Exchanges an authorization code for user info, upserts the user, and signs a session JWT.
   */
  public static async handleGoogleCallback(code: string): Promise<{ token: string; user: SessionUser }> {
    const { tokens } = await googleOAuthClient.getToken(code);
    googleOAuthClient.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new Error('No id_token returned from Google OAuth exchange');
    }

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Invalid Google ID token payload');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || null;

    // Upsert user in PostgreSQL
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        googleId,
        name,
        avatarUrl,
      },
      create: {
        googleId,
        email,
        name,
        avatarUrl,
      },
    });

    // Ensure user has at least one default sender identity
    const existingSender = await prisma.senderIdentity.findFirst({
      where: { userId: user.id },
    });

    if (!existingSender) {
      await prisma.senderIdentity.create({
        data: {
          userId: user.id,
          email: user.email,
          name: user.name,
          hourlyLimit: env.DEFAULT_MAX_EMAILS_PER_HOUR,
          minDelayMs: env.DEFAULT_MIN_DELAY_SECONDS * 1000,
          isDefault: true,
        },
      });
    }

    const sessionPayload: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };

    const token = this.generateToken(sessionPayload);

    return { token, user: sessionPayload };
  }

  /**
   * Creates a signed JWT session token.
   */
  public static generateToken(user: SessionUser): string {
    return jwt.sign(user, env.JWT_SECRET, { expiresIn: '7d' });
  }

  /**
   * Verifies and decodes a session JWT.
   */
  public static verifyToken(token: string): SessionUser | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as SessionUser;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves full user profile by ID.
   */
  public static async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        slackIntegration: {
          select: {
            isActive: true,
            slackTeamName: true,
            channelName: true,
            lastNotifiedAt: true,
          },
        },
      },
    });
  }
}
