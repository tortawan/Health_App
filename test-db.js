const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Using the bucket name from your env file
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'food-photos';

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing API Keys.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("---------------------------------------------------");
  console.log("🛠️  TESTING CLOUD DB: " + supabaseUrl);
  console.log("---------------------------------------------------");

  // 1. TEST SQL FUNCTION
  console.log("\n1️⃣  Testing SQL Function 'match_foods'...");
  const dummyEmbedding = Array(384).fill(0.1); 

  // Notice we use 'p_user_id' in the definition, but Supabase maps arguments by position or name.
  // We can just call it normally.
  const { data: rpcData, error: rpcError } = await supabase.rpc('match_foods', {
    query_embedding: dummyEmbedding,
    query_text: "apple",
    match_threshold: 0.1,
    match_count: 5,
    p_user_id: null 
  });

  if (rpcError) {
    console.error("❌ SQL CRASH:", rpcError.message);
    if (rpcError.message.includes("does not match expected type")) console.log("   👉 Hint: You still need to run the ::double precision cast fix.");
    if (rpcError.message.includes("ambiguous")) console.log("   👉 Hint: You didn't rename the parameter to p_user_id.");
  } else {
    console.log("✅ SQL SUCCESS! The database function is fixed.");
  }

  // 2. TEST UPLOAD
  console.log(`\n2️⃣  Testing Upload to bucket: '${bucketName}'...`);
  const filePath = String.raw`C:\Users\torta\Desktop\Health_App\tests\fixtures\sample.png`;

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found at: ${filePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = `test-upload-${Date.now()}.png`;

  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from(bucketName)
    .upload(fileName, fileBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) {
    console.error("❌ Upload Failed:", uploadError.message);
    console.log("   👉 Hint: Go to Supabase > Storage. Does 'food-photos' bucket exist? Is it set to Public?");
  } else {
    console.log(`✅ Upload Success! Path: ${uploadData.path}`);
  }
}

runTest();