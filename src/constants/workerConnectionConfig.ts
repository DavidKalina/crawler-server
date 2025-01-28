import { WorkerOptions } from "bullmq";

export const WORKER_CONNECTION_CONFIG: WorkerOptions = {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    keepAlive: 30000,
    commandTimeout: 10000,
  },

  // Concurrent job processing
  concurrency: 10,

  // Lock settings
  lockDuration: 30000,
  lockRenewTime: 15000,
  stalledInterval: 30000,

  // Job completion settings
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },

  // Failure settings
  removeOnFail: {
    age: 7 * 24 * 3600,
    count: 1000,
  },

  // Performance settings
  drainDelay: 5,

  // Retry settings
  maxStalledCount: 2,

  // Timeout settings can be set when adding jobs instead
  // Example when adding jobs:
  // {
  //   backoff: {
  //     type: 'exponential',
  //     delay: 1000  // Initial delay of 1s
  //   },
  //   attempts: 3
  // }

  metrics: {
    maxDataPoints: 12 * 24,
  },
};
