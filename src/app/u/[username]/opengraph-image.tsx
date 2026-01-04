import { ImageResponse } from "next/og";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};

function calculateStreak(logDates: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const uniqueDays = Array.from(
    new Set(
      logDates.map((date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      }),
    ),
  ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let streak = 0;
  let cursor = today;

  for (const iso of uniqueDays) {
    const day = new Date(iso);
    if (day.getTime() === cursor.getTime()) {
      streak += 1;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 1);
    } else if (day.getTime() > cursor.getTime()) {
      continue;
    } else {
      break;
    }
  }

  return streak;
}

export default async function Image({
  params,
}: {
  params: { username: string };
}) {
  if (!supabaseServer) {
    return new ImageResponse(
      (
        <div
          style={{
            width: size.width,
            height: size.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#fff",
            fontSize: 48,
            fontWeight: 700,
          }}
        >
          Supabase not configured
        </div>
      ),
      { ...size, status: 500 },
    );
  }

  const slug = params.username;
  let { data: profile } = await supabaseServer
    .from("user_profiles")
    .select("user_id, username, is_public, daily_protein_target, daily_calorie_target")
    .eq("username", slug)
    .maybeSingle();

  if (!profile) {
    const fallback = await supabaseServer
      .from("user_profiles")
      .select("user_id, username, is_public, daily_protein_target, daily_calorie_target")
      .eq("user_id", slug)
      .maybeSingle();
    profile = fallback.data ?? null;
  }

  if (!profile || profile.is_public !== true) {
    return new ImageResponse(
      (
        <div
          style={{
            width: size.width,
            height: size.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 44,
            fontWeight: 700,
          }}
        >
          Profile not public
        </div>
      ),
      { ...size, status: 404 },
    );
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 60);

  const { data: logs } = await supabaseServer
    .from("food_logs")
    .select("consumed_at, calories, protein")
    .eq("user_id", profile.user_id)
    .gte("consumed_at", windowStart.toISOString());

  const streak = logs ? calculateStreak(logs.map((row) => row.consumed_at as string)) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayProtein =
    logs
      ?.filter((row) => new Date(row.consumed_at as string).getTime() >= today.getTime())
      .reduce((total, row) => total + Number(row.protein ?? 0), 0) ?? 0;
  const todayCalories =
    logs
      ?.filter((row) => new Date(row.consumed_at as string).getTime() >= today.getTime())
      .reduce((total, row) => total + Number(row.calories ?? 0), 0) ?? 0;

  const name = profile.username || `User ${profile.user_id.slice(0, 6)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          flexDirection: "column",
          padding: "64px",
          background: "linear-gradient(135deg, #0f172a 0%, #0b5d4b 100%)",
          color: "#ecfeff",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6ee7b7" }}>
              Visual RAG
            </div>
            <div style={{ fontSize: 56, fontWeight: 800 }}>{name}</div>
            <div style={{ color: "#cbd5e1", marginTop: 8 }}>Public profile snapshot</div>
          </div>
          <div
            style={{
              padding: "12px 24px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              fontSize: 24,
            }}
          >
            🔥 Streak: {streak} days
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginTop: 40,
          }}
        >
          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ fontSize: 18, color: "#cbd5e1" }}>Today&apos;s Protein</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#6ee7b7" }}>
              {Math.round(todayProtein)} g
            </div>
            <div style={{ color: "#cbd5e1" }}>
              Target: {Math.round(profile.daily_protein_target ?? 0)} g
            </div>
          </div>
          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ fontSize: 18, color: "#cbd5e1" }}>Today&apos;s Calories</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#fde68a" }}>
              {Math.round(todayCalories)} kcal
            </div>
            <div style={{ color: "#cbd5e1" }}>
              Target: {Math.round(profile.daily_calorie_target ?? 0)} kcal
            </div>
          </div>
          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ fontSize: 18, color: "#cbd5e1" }}>Last 60d logs</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#93c5fd" }}>
              {logs?.length ?? 0}
            </div>
            <div style={{ color: "#cbd5e1" }}>Keep the streak alive!</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
