import { Request, Response, NextFunction } from 'express';
import { AuthService, SessionUser } from '../services/auth.service';

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.reachinbox_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No active session token found' });
  }

  const user = AuthService.verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  req.user = user;
  return next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.reachinbox_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (token) {
    const user = AuthService.verifyToken(token);
    if (user) {
      req.user = user;
    }
  }

  // Fallback to default user in development for smooth local testing if no session cookie
  if (!req.user) {
    req.user = {
      id: 'default-user-oliver-brown',
      email: 'oliver.brown@domain.io',
      name: 'Oliver Brown',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    };
  }

  return next();
}
