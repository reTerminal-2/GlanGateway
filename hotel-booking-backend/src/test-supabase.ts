import { supabaseAdmin } from "./core/supabase";

async function run() {
  console.log("📡 Querying pg_trigger catalog...");
  try {
    const { data, error } = await supabaseAdmin.from("pg_trigger").select("*").limit(1);
    console.log("pg_trigger select:", { data, error });
  } catch (err: any) {
    console.error("Catch error:", err.message);
  }
}

run().catch(console.error);
