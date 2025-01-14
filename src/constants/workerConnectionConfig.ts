import { WorkerOptions } from "bullmq";

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
};
