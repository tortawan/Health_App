import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { createSupabaseServerClient } from "@/lib/supabase";

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV file with the `file` field." }, { status: 400 });
  }

  const text = await file.text();
  let records: Record<string, unknown>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to parse CSV." },
      { status: 400 },
    );
  }

  if (!records.length) {
    return NextResponse.json({ error: "CSV contained no rows." }, { status: 400 });
  }

  const payload = records
    .slice(0, 500)
    .map((row) => {
      const consumed = row.consumed_at || row.logged_at;
      return {
        user_id: session.user.id,
        food_name: (row.food_name as string) || (row.name as string) || "Imported meal",
        weight_g: normalizeNumber(row.weight_g ?? row.weight ?? 100) ?? 100,
        calories: normalizeNumber(row.calories),
        protein: normalizeNumber(row.protein),
        carbs: normalizeNumber(row.carbs),
        fat: normalizeNumber(row.fat),
        fiber: normalizeNumber((row as { fiber?: unknown }).fiber),
        sugar: normalizeNumber((row as { sugar?: unknown }).sugar),
        sodium: normalizeNumber((row as { sodium?: unknown }).sodium),
        image_path: (row as { image_path?: unknown }).image_path ?? null,
        consumed_at: consumed ? new Date(consumed as string).toISOString() : new Date().toISOString(),
      };
    })
    .filter((row) => row.food_name);

  const { data, error } = await supabase.from("food_logs").insert(payload).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0 });
}
