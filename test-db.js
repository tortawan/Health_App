import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing API Keys.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("\n🧪 STARTING VERIFICATION...");

  // 1. Text-Only Search (Simulating "Manual Search")
  console.log("\n1️⃣  Testing Manual Search (Text Only: 'chicken')...");
  const { data: textData, error: textError } = await supabase.rpc('match_foods', {
    query_embedding: null, // ✅ THIS MUST WORK NOW
    query_text: "chicken",
    match_threshold: 0.0,
    match_count: 3,
    user_id: null
  });

  if (textError) {
    console.error("❌ Text Search Failed:", textError.message);
  } else if (!textData || textData.length === 0) {
    console.error("⚠️  Text Search Returned 0 Results. (Is the DB empty?)");
  } else {
    console.log(`✅ Text Search Success! Found: ${textData[0].description}`);
  }

  // 2. Vector Search (Simulating "Scan")
  // Note: This still might return 0 if the dummy vector is too random, 
  // but it verifies the function doesn't crash.
  console.log("\n2️⃣  Testing Vector Search (Dummy Vector)...");
  const dummyEmbedding = Array(384).fill(0.1); 
  const { data: vecData, error: vecError } = await supabase.rpc('match_foods', {
    query_embedding: dummyEmbedding,
    query_text: null,
    match_threshold: 0.0, // Lower threshold to force results if possible
    match_count: 3,
    user_id: null
  });

  if (vecError) console.error("❌ Vector Search Failed:", vecError.message);
  else console.log(`✅ Vector Search RPC Call Successful (Matches: ${vecData?.length})`);
}

runTest();