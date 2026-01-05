import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket =
  process.env.SUPABASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
  "user-images";

if (!url || !serviceKey) {
  console.warn("Cleanup cron missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false },
      })
    : null;

async function listAll(prefix = ""): Promise<{ path: string; created_at?: string; updated_at?: string; last_accessed_at?: string }[]> {
  if (!supabase) return [];
  const files: { path: string; created_at?: string; updated_at?: string; last_accessed_at?: string }[] = [];
  let from = 0;
  const size = 100;

  // eslint-disable-next-line no-constant-condition
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
        const nested = await listAll(`${prefix}${entry.name}/`);
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

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase credentials missing" },
      { status: 500 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: logs, error: logsError } = await supabase
    .from("food_logs")
    .select("image_path")
    .not("image_path", "is", null);

  if (logsError) {
    return NextResponse.json(
      { error: logsError.message },
      { status: 500 },
    );
  }

  const referenced = new Set((logs ?? []).map((row) => row.image_path));
  const files = await listAll();

  const stale = files.filter((file) => {
    const updated = new Date(
      file.updated_at ?? file.created_at ?? file.last_accessed_at ?? new Date(0),
    );
    const isOld = updated < cutoff;
    const orphaned = !referenced.has(file.path);
    return isOld || orphaned;
  });

  if (!stale.length) {
    return NextResponse.json({ deleted: 0, message: "No stale images to delete." });
  }

  const { error } = await supabase.storage
    .from(bucket)
    .remove(stale.map((file) => file.path));

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: stale.length });
}
