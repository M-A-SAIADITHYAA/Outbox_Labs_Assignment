import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

function getRedisOptions(): RedisOptions {
  const baseOptions: RedisOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };

  if (env.REDIS_URL) {
    try {
      const parsed = new URL(env.REDIS_URL);
      return {
        ...baseOptions,
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
      };
    } catch (e) {
      console.warn('⚠️ Could not parse REDIS_URL, falling back to host/port configs');
    }
  }

  return {
    ...baseOptions,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  };
}

export const redisConnectionOptions: RedisOptions = getRedisOptions();

export const redisClient = new Redis(redisConnectionOptions);

redisClient.on('connect', () => {
  console.log(`🔌 Connected to Redis at ${redisConnectionOptions.host}:${redisConnectionOptions.port}`);
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err);
});
