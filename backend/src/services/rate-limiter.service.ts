import { redisClient } from '../config/redis';

const RATE_LIMIT_LUA_SCRIPT = `
local hourlyKey = KEYS[1]
local lastSendKey = KEYS[2]
local slackNotifiedKey = KEYS[3]

local maxPerHour = tonumber(ARGV[1])
local minDelayMs = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local nextHourWindowMs = tonumber(ARGV[4])

-- 1. Check Hourly Limit
local currentCount = tonumber(redis.call('GET', hourlyKey) or '0')
if currentCount >= maxPerHour then
    -- Check if Slack was already notified for this hour window
    local alreadyNotified = redis.call('GET', slackNotifiedKey)
    local triggerSlack = 0
    if not alreadyNotified then
        redis.call('SET', slackNotifiedKey, '1', 'EX', 7200)
        triggerSlack = 1
    end
    return {0, nextHourWindowMs, triggerSlack, currentCount}
end

-- 2. Check Inter-Send Delay
local lastSendTime = tonumber(redis.call('GET', lastSendKey) or '0')
local waitMs = 0
local timeSinceLastSend = nowMs - lastSendTime

if timeSinceLastSend < minDelayMs then
    waitMs = minDelayMs - timeSinceLastSend
end

-- 3. Atomic Allocation
local newCount = redis.call('INCR', hourlyKey)
if newCount == 1 then
    redis.call('EXPIRE', hourlyKey, 7200)
end

local scheduledSendTime = nowMs + waitMs
redis.call('SET', lastSendKey, tostring(scheduledSendTime), 'EX', 3600)

return {1, waitMs, 0, newCount}
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  waitMs: number;
  triggerSlack: boolean;
  currentCount: number;
  nextWindowTimestamp?: number;
}

export class RateLimiterService {
  private static scriptSha: string | null = null;

  private static async getScriptSha(): Promise<string> {
    if (!this.scriptSha) {
      this.scriptSha = await redisClient.script('LOAD', RATE_LIMIT_LUA_SCRIPT) as string;
    }
    return this.scriptSha;
  }

  /**
   * Atomically checks hourly limit and inter-send delay for a sender.
   */
  public static async checkAndAllocate(
    senderId: string,
    maxPerHour: number,
    minDelayMs: number
  ): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const currentHourTimestamp = Math.floor(now / 3600000) * 3600000;
    const nextHourTimestamp = currentHourTimestamp + 3600000;

    const hourlyKey = `ratelimit:hourly:${senderId}:${currentHourTimestamp}`;
    const lastSendKey = `ratelimit:last_send:${senderId}`;
    const slackNotifiedKey = `ratelimit:slack_notified:${senderId}:${currentHourTimestamp}`;

    try {
      const sha = await this.getScriptSha();
      const rawResult = await redisClient.evalsha(
        sha,
        3,
        hourlyKey,
        lastSendKey,
        slackNotifiedKey,
        maxPerHour.toString(),
        minDelayMs.toString(),
        now.toString(),
        nextHourTimestamp.toString()
      ) as [number, number, number, number];

      const [allowed, waitOrNextTime, triggerSlack, count] = rawResult;

      return {
        allowed: allowed === 1,
        waitMs: allowed === 1 ? waitOrNextTime : 0,
        triggerSlack: triggerSlack === 1,
        currentCount: count,
        nextWindowTimestamp: allowed === 0 ? waitOrNextTime : undefined,
      };
    } catch (err) {
      // Fallback: reload and re-evaluate if NOSCRIPT error occurred
      const rawResult = await redisClient.eval(
        RATE_LIMIT_LUA_SCRIPT,
        3,
        hourlyKey,
        lastSendKey,
        slackNotifiedKey,
        maxPerHour.toString(),
        minDelayMs.toString(),
        now.toString(),
        nextHourTimestamp.toString()
      ) as [number, number, number, number];

      const [allowed, waitOrNextTime, triggerSlack, count] = rawResult;

      return {
        allowed: allowed === 1,
        waitMs: allowed === 1 ? waitOrNextTime : 0,
        triggerSlack: triggerSlack === 1,
        currentCount: count,
        nextWindowTimestamp: allowed === 0 ? waitOrNextTime : undefined,
      };
    }
  }

  /**
   * Resets rate-limiting counters for a sender (useful in tests).
   */
  public static async resetSenderLimits(senderId: string): Promise<void> {
    const now = Date.now();
    const currentHourTimestamp = Math.floor(now / 3600000) * 3600000;
    const hourlyKey = `ratelimit:hourly:${senderId}:${currentHourTimestamp}`;
    const lastSendKey = `ratelimit:last_send:${senderId}`;
    const slackNotifiedKey = `ratelimit:slack_notified:${senderId}:${currentHourTimestamp}`;

    await redisClient.del(hourlyKey, lastSendKey, slackNotifiedKey);
  }
}
