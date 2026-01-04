import Link from "next/link";
import { CommunityFeedClient, type CommunityFeedItem } from "./community-feed-client";
import { createSupabaseServerClient } from "@/lib/supabase";

export const revalidate = 0;

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

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, is_public, username, daily_protein_target");

  const publicProfiles = (profiles ?? []).filter((profile) => profile.is_public);
  const publicUserIds = publicProfiles.map((profile) => profile.user_id);

  const { data: feedLogs } = publicUserIds.length
    ? await supabase
        .from("food_logs")
        .select(
          "id, user_id, food_name, weight_g, calories, protein, carbs, fat, fiber, sugar, sodium, image_path, consumed_at",
        )
        .in("user_id", publicUserIds)
        .order("consumed_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const logIds = (feedLogs ?? []).map((log) => log.id as string);

  const { data: likes } = logIds.length
    ? await supabase.from("log_likes").select("log_id, user_id").in("log_id", logIds)
    : { data: [] };

  const feed: CommunityFeedItem[] =
    feedLogs?.map((log) => {
      const profile = publicProfiles.find((p) => p.user_id === log.user_id);
      const label = profile?.username || `User ${log.user_id.slice(0, 8)}`;
      const logLikes = (likes ?? []).filter((like) => like.log_id === log.id);
      const likeCount = logLikes.length;
      const likedByViewer =
        session?.user?.id && logLikes.some((like) => like.user_id === session.user.id);

      return {
        id: log.id as string,
        food_name: log.food_name as string,
        weight_g: Number(log.weight_g ?? 0),
        calories: log.calories as number | null,
        protein: log.protein as number | null,
        carbs: log.carbs as number | null,
        fat: log.fat as number | null,
        fiber: (log as { fiber?: number | null }).fiber ?? null,
        sugar: (log as { sugar?: number | null }).sugar ?? null,
        sodium: (log as { sodium?: number | null }).sodium ?? null,
        image_path: (log as { image_path?: string | null }).image_path ?? null,
        consumed_at: log.consumed_at as string,
        profileLabel: label,
        likeCount,
        likedByViewer: Boolean(likedByViewer),
      };
    }) ?? [];

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const streakWindow = new Date(now);
  streakWindow.setDate(streakWindow.getDate() - 60);

  const { data: leaderboardLogs } = publicUserIds.length
    ? await supabase
        .from("food_logs")
        .select("user_id, consumed_at, protein")
        .in("user_id", publicUserIds)
        .gte("consumed_at", streakWindow.toISOString())
    : { data: [] };

  const streaks = publicUserIds.map((userId) => {
    const userDates =
      leaderboardLogs
        ?.filter((row) => row.user_id === userId)
        .map((row) => row.consumed_at as string) ?? [];
    return {
      userId,
      streak: calculateStreak(userDates),
    };
  });

  const topStreaks = streaks
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 5)
    .map((entry) => {
      const profile = publicProfiles.find((p) => p.user_id === entry.userId);
      return {
        label: profile?.username || `User ${entry.userId.slice(0, 8)}`,
        streak: entry.streak,
      };
    });

  const topProtein = publicUserIds
    .map((userId) => {
      const todaysProtein =
        leaderboardLogs
          ?.filter(
            (row) =>
              row.user_id === userId &&
              new Date(row.consumed_at as string).getTime() >= todayStart.getTime(),
          )
          .reduce((total, row) => total + Number(row.protein ?? 0), 0) ?? 0;
      const profile = publicProfiles.find((p) => p.user_id === userId);
      const target = profile?.daily_protein_target ?? null;
      return {
        userId,
        todaysProtein,
        label: profile?.username || `User ${userId.slice(0, 8)}`,
        target,
      };
    })
    .sort((a, b) => b.todaysProtein - a.todaysProtein)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">Community</p>
          <h1 className="text-2xl font-semibold text-white">Public meal feed</h1>
          <p className="text-sm text-white/60">
            See what other public profiles are logging. Toggle Public in Settings to join in.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to tracker
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,0.6fr]">
        <div className="space-y-3">
          <CommunityFeedClient initialFeed={feed} viewerId={session?.user?.id ?? null} />
        </div>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-200">Leaderboards</p>
            <h2 className="text-lg font-semibold text-white">Streaks & Protein</h2>
            <p className="text-xs text-white/60">Calculated from public profiles only.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">Top streaks</p>
            <div className="space-y-1">
              {topStreaks.length ? (
                topStreaks.map((entry, idx) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    key={`${entry.label}-${idx}`}
                  >
                    <span>
                      #{idx + 1} {entry.label}
                    </span>
                    <span className="text-emerald-200">{entry.streak} days</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-white/60">No streak data yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">Top protein today</p>
            <div className="space-y-1">
              {topProtein.length ? (
                topProtein.map((entry, idx) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    key={`${entry.label}-${idx}`}
                  >
                    <div>
                      <p>
                        #{idx + 1} {entry.label}
                      </p>
                      {entry.target ? (
                        <p className="text-xs text-white/60">
                          Target {Math.round(entry.target)}g
                        </p>
                      ) : null}
                    </div>
                    <span className="text-emerald-200">
                      {Math.round(entry.todaysProtein)}g
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-white/60">No protein logs yet today.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
