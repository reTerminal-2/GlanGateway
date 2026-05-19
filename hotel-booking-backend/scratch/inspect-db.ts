import { supabaseAdmin } from "../src/core/supabase";

async function inspect() {
  console.log("Fetching booking table schema/sample...");
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Error fetching bookings:", error);
  } else {
    console.log("Sample Booking:", data);
  }

  // Also query information_schema to get column names and types
  const { data: columns, error: colError } = await supabaseAdmin.rpc("inspect_columns_if_exists");
  if (colError) {
    // If RPC doesn't exist, let's try querying information_schema via a generic query or a raw sql query if possible.
    // In Supabase we can try to run a select on a view or table if we have permissions, or just inspect columns from the sample data.
    console.log("RPC inspect_columns_if_exists failed or doesn't exist. Let's try select from information_schema:");
  }
}

inspect().catch(console.error);
