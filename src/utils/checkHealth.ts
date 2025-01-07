import { Queue } from "bullmq";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    api: {
      status: "healthy" | "unhealthy";
      uptime: number;
    };
    redis: {
      status: "healthy" | "unhealthy";
      message?: string;
    };
    supabase: {
      status: "healthy" | "unhealthy";
      message?: string;
    };
    queue: {
      status: "healthy" | "degraded" | "unhealthy";
      activeJobs: number;
      waitingJobs: number;
      completedJobs: number;
      failedJobs: number;
    };
  };
}

// Add this health check function
export async function checkQueueHealth(queue: Queue): Promise<HealthStatus["services"]["queue"]> {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      status: failed > 0 ? "degraded" : "healthy",
      activeJobs: active,
      waitingJobs: waiting,
      completedJobs: completed,
      failedJobs: failed,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      activeJobs: 0,
      waitingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
    };
  }
}
