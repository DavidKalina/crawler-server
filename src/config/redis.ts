// constants/redisConfig.ts
import { RedisOptions } from "ioredis";

export const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true; // Only reconnect on READONLY error
    }
    return false;
  },
  // Enable keepalive to prevent connection timeouts
  keepAlive: 10000,
  // Connection name for easier debugging
  connectionName: "crawler-service",

  // Enable auto-reconnect
  // Share connection across instances to prevent connection leaks
  // Optional: Enable TLS if needed (not required for local development)
  // tls: process.env.NODE_ENV === 'production' ? {} : undefined,
};

// Create a shared Redis connection configuration for BullMQ
export const BULL_REDIS_CONFIG = {
  connection: REDIS_CONFIG,
};

// Optional: Helper function to create Redis keys with consistent prefix
export const createRedisKey = (type: string, identifier: string): string => {
  const prefix = "crawler";
  return `${prefix}:${type}:${identifier}`;
};
