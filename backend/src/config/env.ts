import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend or root directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:5000'),

  // PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // Worker Settings
  WORKER_CONCURRENCY: z.coerce.number().default(10),
  DEFAULT_MIN_DELAY_SECONDS: z.coerce.number().default(2),
  DEFAULT_MAX_EMAILS_PER_HOUR: z.coerce.number().default(200),

  // Elasticsearch
  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('reachinbox-emails'),

  // Ethereal SMTP
  ETHEREAL_USER: z.string().optional().default(''),
  ETHEREAL_PASS: z.string().optional().default(''),
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default('dummy-google-client-id'),
  GOOGLE_CLIENT_SECRET: z.string().default('dummy-google-client-secret'),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/auth/google/callback'),

  // JWT & Security
  JWT_SECRET: z.string().min(16).default('development-super-secret-jwt-key-min-32-chars-long!'),
  ENCRYPTION_KEY: z.string().length(64).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().default('dummy-slack-client-id'),
  SLACK_CLIENT_SECRET: z.string().default('dummy-slack-client-secret'),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/callback'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
