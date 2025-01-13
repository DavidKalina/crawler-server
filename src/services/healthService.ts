// services/healthService.ts
import { Queue } from "bullmq";
import { SupabaseClient } from "@supabase/supabase-js";
import { checkQueueHealth, HealthStatus } from "../utils/checkHealth";

export class HealthService {
  constructor(private queue: Queue, private supabase: SupabaseClient) {}

  async getSystemHealth(): Promise<{ status: HealthStatus; statusCode: number }> {
    const startTime = process.uptime();
    let status: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        api: {
          status: "healthy",
          uptime: startTime,
        },
        redis: {
          status: "healthy",
        },
        supabase: {
          status: "healthy",
        },
        queue: await checkQueueHealth(this.queue),
      },
    };

    // Check Redis connection through BullMQ
    try {
      await (await this.queue.client).ping();
    } catch (error) {
      status.services.redis = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Redis connection failed",
      };
      status.status = "unhealthy";
    }

    // Check Supabase connection
    try {
      const { error } = await this.supabase.from("web_crawl_jobs").select("id").limit(1);
      if (error) throw error;
    } catch (error) {
      status.services.supabase = {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Supabase connection failed",
      };
      status.status = "unhealthy";
    }

    // If queue is degraded but everything else is healthy, mark overall as degraded
    if (status.status === "healthy" && status.services.queue.status === "degraded") {
      status.status = "degraded";
    }

    const statusCode = status.status === "unhealthy" ? 503 : 200;
    return { status, statusCode };
  }
}
