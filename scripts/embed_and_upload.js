// eslint-disable-next-line @typescript-eslint/no-require-imports

/**
 * Embeds the flattened USDA data and uploads it to Supabase.
 *
 * Prerequisites:
 * 1) Run `node scripts/download_usda.js`
 * 2) Run `node scripts/flatten_data.js`
 *
 * Required env vars:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - EMBEDDING_MODEL (optional)
 */
const path = require("path");

// Load environment variables immediately so Supabase client can find them
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const fs = require("fs");

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 250);
const DATA_PATH = path.join(__dirname, "data", "flattened.json");

async function getSupabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  
  // Try to find the URL in various common env var names
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  
  // Try to find the Service Role Key (preferred) or Anon Key
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

async function getEmbedder() {
  const { pipeline } = await import("@xenova/transformers");
  const modelId = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
  
  if (!process.env.EMBEDDING_MODEL) {
    console.warn(
      "EMBEDDING_MODEL not set. Defaulting to Xenova/all-MiniLM-L6-v2 — ensure this matches your API runtime.",
    );
  }
  const pipe = await pipeline("feature-extraction", modelId);

  return async (text) => {
    const result = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(result.data);
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(
      `Flattened data not found at ${DATA_PATH}. Run scripts/flatten_data.js first.`,
    );
  }

  const foods = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  console.log(`Loaded ${foods.length} flattened foods. Generating embeddings...`);

  const embed = await getEmbedder();
  const supabase = await getSupabaseClient();

  const batches = chunk(foods, BATCH_SIZE);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const payload = [];

    for (const item of batch) {
      // Generate the vector for the food description
      const embedding = await embed(item.description);
      
      payload.push({
        id: item.id,
        description: item.description,
        kcal_100g: item.kcal_100g,
        protein_100g: item.protein_100g,
        carbs_100g: item.carbs_100g,
        fat_100g: item.fat_100g,
        fiber_100g: item.fiber_100g,
        sugar_100g: item.sugar_100g,
        sodium_100g: item.sodium_100g,
        embedding,
      });
    }

    // Upsert into Supabase
    const { error } = await supabase.from("usda_library").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }

    console.log(
      `Inserted batch ${i + 1}/${batches.length} (${payload.length} rows).`,
    );
  }

  console.log("Upload complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
