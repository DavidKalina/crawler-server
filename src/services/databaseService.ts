// types/databaseTypes.ts
export interface CrawlJobRecord {
  id: string;
  start_url: string;
  max_depth: number;
  status:
    | "pending"
    | "active"
    | "completed"
    | "failed"
    | "stopping"
    | "crawled"
    | "running"
    | "canceled";
  total_pages_crawled?: number;
  stop_requested_at?: string;
  created_at?: string;
  completed_at?: string;
  processing_stats?: Record<string, any>;
  user_id: string;
}

// services/databaseService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export class DatabaseService {
  constructor(private supabase: SupabaseClient) {}

  async createCrawlJob(data: Omit<CrawlJobRecord, "created_at">) {
    const { data: newJob, error } = await this.supabase
      .from("web_crawl_jobs")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return newJob;
  }

  async getRecentJobs(limit = 10) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getJobById(id: string) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  async updateJobStatus(
    id: string,
    status: CrawlJobRecord["status"],
    additionalData: Partial<CrawlJobRecord> = {}
  ) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .update({
        status,
        ...additionalData,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async incrementPagesCount(id: string) {
    const { data, error } = await this.supabase.rpc("increment_pages_crawled", {
      job_id: id,
      increment_by: 1,
    });

    if (error) throw error;
    return data;
  }

  async incrementErrorsCount(id: string) {
    const { data, error } = await this.supabase.rpc(`increment_crawl_errors`, {
      job_id: id,
      increment_by: 1,
    });
    if (error) throw error;
    return data;
  }

  async getJobStatus(id: string) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .select("status")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data.status;
  }

  async incrementUserPagesCrawled(crawlId: string) {
    await this.supabase
      .from("web_crawl_jobs")
      .select("user_id")
      .eq("id", crawlId)
      .single()
      .then(({ data: jobData, error: jobError }) => {
        if (jobError) throw jobError;
        if (!jobData?.user_id) throw new Error("No user_id found for crawl job");

        return this.supabase.rpc("increment_user_pages_used", {
          user_id: jobData.user_id,
        });
      });
  }

  async logCrawlOperation(data: {
    crawl_job_id: string;
    level: "info" | "error" | "warning";
    message: string;
    metadata?: Record<string, any>;
  }) {
    const { error } = await this.supabase.from("crawler_logs").insert(data);

    if (error) throw error;
  }

  async stopJob(id: string) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .update({
        status: "stopped",
        stop_requested_at: new Date().toISOString(),
        processing_stats: {
          stopped_at: new Date().toISOString(),
        },
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
  async updateJobAfterQueueClear(id: string, jobCount: number) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .update({
        status: "stopped",
        stop_requested_at: new Date().toISOString(),
        processing_stats: {
          cleared_at: new Date().toISOString(),
          cleared_job_count: jobCount,
        },
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateJobAfterQueueReset(id: string, jobCount: number) {
    const { data, error } = await this.supabase
      .from("web_crawl_jobs")
      .update({
        status: "stopped",
        stop_requested_at: new Date().toISOString(),
        processing_stats: {
          reset_at: new Date().toISOString(),
          cleared_job_count: jobCount,
        },
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
