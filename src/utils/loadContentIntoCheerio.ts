import { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { CrawlDebugInfo } from "src";
import { supabase } from "src/lib/supabaseClient";

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
    debugInfo.error = `Cheerio load failed: ${error.message}`;
    await supabase.from("crawler_logs").insert({
      crawl_job_id: jobId,
      level: "error",
      message: `Crawl failed: ${error.message}`,
      metadata: debugInfo,
    });
    throw error;
  }
}
