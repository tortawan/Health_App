import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(
      headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          const asString = String(value).replace(/"/g, '""');
          return `"${asString}"`;
        })
        .join(","),
    );
  });
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();
  const type = (searchParams.get("type") ?? "food_logs").toLowerCase();

  const table = type === "weight_logs" ? "weight_logs" : "food_logs";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", session.user.id)
    .order(table === "weight_logs" ? "logged_at" : "consumed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (format === "json") {
    return NextResponse.json({ data });
  }

  const csv = toCsv((data as Record<string, unknown>[] | null) ?? []);
  const filename = `${table}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
