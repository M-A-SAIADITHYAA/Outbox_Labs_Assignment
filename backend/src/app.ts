import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { redisClient } from './config/redis';
import emailRoutes from './routes/email.routes';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import slackRoutes from './routes/slack.routes';
import { EmailController } from './controllers/email.controller';
import { optionalAuth } from './middleware/auth.middleware';

const prisma = new PrismaClient();
export const app = express();

// Middleware configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin === env.FRONTEND_URL ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logger in development
if (env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  let dbStatus = false;
  let redisStatus = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = true;
  } catch (err) {
    console.error('Healthcheck DB Error:', err);
  }

  try {
    const ping = await redisClient.ping();
    redisStatus = ping === 'PONG';
  } catch (err) {
    console.error('Healthcheck Redis Error:', err);
  }

  const isHealthy = dbStatus && redisStatus;

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/emails', optionalAuth, emailRoutes);
app.get('/api/senders', optionalAuth, EmailController.getSenders);
app.use('/admin/queues', adminRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  return res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});
