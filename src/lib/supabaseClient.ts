import { createClient } from "@supabase/supabase-js";
import { Database } from "src/database.types";

export const supabase = createClient<Partial<Database>>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
