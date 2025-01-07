import { supabase } from "../lib/supabaseClient";

export const incrementPages = async (jobId: string) => {
  const { data, error } = await supabase.rpc("increment_total_pages_crawled", {
    job_id: jobId,
  });

  if (error) {
    console.error("Error incrementing pages:", error);
    // throw error;
  }

  return data; // Returns the new total
};
