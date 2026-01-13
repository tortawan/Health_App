// eslint-disable-next-line @typescript-eslint/no-require-imports
// Delete storage objects older than 30 days or orphaned from food_logs.image_path.
// Run with: node scripts/cleanup_storage.js
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and optionally SUPABASE_STORAGE_BUCKET.
 
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "food-photos";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

async function listAll(prefix = "", depth = 0) {
  if (depth > 10) {
    console.warn(`Max depth reached at ${prefix}`);
    return [];
  }

  const files = [];
  let from = 0;
  const size = 100;

   
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: size,
      offset: from,
    });
    if (error) {
      throw error;
    }
    if (!data?.length) break;
    for (const entry of data) {
      if (entry.name === ".emptyFolderPlaceholder") continue;
      if (entry.metadata?.mimetype === "folder") {
        const nested = await listAll(`${prefix}${entry.name}/`, depth + 1);
        files.push(...nested);
      } else {
        files.push({ ...entry, path: `${prefix}${entry.name}` });
      }
    }
    if (data.length < size) break;
    from += size;
  }

  return files;
}

async function main() {
  const { data: logs, error: logsError } = await supabase
    .from("food_logs")
    .select("image_path")
    .not("image_path", "is", null);

  if (logsError) throw logsError;

  const referenced = new Set((logs ?? []).map((row) => row.image_path));
  const files = await listAll();

  const stale = files.filter((file) => {
    const updated = new Date(file.updated_at ?? file.created_at ?? file.last_accessed_at ?? new Date(0));
    const isOld = updated < cutoff;
    const orphaned = !referenced.has(file.path);
    return isOld || orphaned;
  });

  if (!stale.length) {
    console.log("No stale images to delete.");
    return;
  }

  const { error } = await supabase.storage.from(bucket).remove(stale.map((file) => file.path));
  if (error) throw error;

  console.log(`Deleted ${stale.length} stale images from ${bucket}`);
}

main().catch((err) => {
  console.error("Cleanup failed", err);
  process.exit(1);
});
