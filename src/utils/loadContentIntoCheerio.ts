import { supabase } from "../lib/supabaseClient";
import { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { CrawlDebugInfo } from "..";

export async function loadContentIntoCheerio(
  jobId: string,
  response: AxiosResponse<any, any>,
  debugInfo: CrawlDebugInfo
) {
  try {
    const $ = cheerio.load(response.data);
    debugInfo.cheerioLoadSuccess = true;
    return $;
  } catch (error) {
    debugInfo.cheerioLoadSuccess = false;
    debugInfo.error = `Cheerio load failed: ${(error as any).message}`;
    await supabase.from("crawler_logs").insert({
      crawl_job_id: jobId,
      level: "error",
      message: `Crawl failed: ${(error as any).message}`,
      metadata: debugInfo,
    });
    throw error;
  }
}
