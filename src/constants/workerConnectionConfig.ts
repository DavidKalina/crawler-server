import { WorkerOptions } from "bullmq";

// Constants for stalled job configuration
const STALLED_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_STALLED_COUNT = 1; // Number of times a job can stall before being marked as failed

export const WORKER_CONNECTION_CONFIG: WorkerOptions = {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },
  removeOnFail: {
    count: 0,
  },
  concurrency: 5,
  // Stalled job settings
  stalledInterval: STALLED_CHECK_INTERVAL,
  maxStalledCount: MAX_STALLED_COUNT,
  // Timeout settings
};
