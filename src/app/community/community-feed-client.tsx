"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type CommunityFeedItem = {
  id: string;
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  image_path?: string | null;
  consumed_at: string;
  profileLabel: string;
  likeCount: number;
  likedByViewer: boolean;
};

export function CommunityFeedClient({
  initialFeed,
  viewerId,
}: {
  initialFeed: CommunityFeedItem[];
  viewerId: string | null;
}) {
  const [feed, setFeed] = useState<CommunityFeedItem[]>(initialFeed);
  const [pending, startTransition] = useTransition();

  const handleToggleLike = (logId: string) => {
    if (!viewerId) {
      toast.error("Sign in to send kudos.");
      return;
    }
    if (!supabaseBrowser) {
      toast.error("Supabase is not configured in the browser.");
      return;
    }

    const current = feed.find((item) => item.id === logId);
    const nextLiked = current ? !current.likedByViewer : true;

    setFeed((prev) =>
      prev.map((item) =>
        item.id === logId
          ? {
              ...item,
              likedByViewer: nextLiked,
              likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
            }
          : item,
      ),
    );

    startTransition(async () => {
      try {
        if (nextLiked) {
          const { error } = await supabaseBrowser
            .from("log_likes")
            .insert({ log_id: logId, user_id: viewerId });
          if (error && error.code !== "23505") {
            throw error;
          }
        } else {
          const { error } = await supabaseBrowser
            .from("log_likes")
            .delete()
            .eq("log_id", logId)
            .eq("user_id", viewerId);
          if (error) throw error;
        }
      } catch (error) {
        console.error(error);
        toast.error("Unable to update kudos. Please retry.");
        setFeed((prev) =>
          prev.map((item) =>
            item.id === logId
              ? {
                  ...item,
                  likedByViewer: !nextLiked,
                  likeCount: Math.max(0, item.likeCount + (nextLiked ? -1 : 1)),
                }
              : item,
          ),
        );
      }
    });
  };

  if (!feed.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-white/70">
        <p className="text-sm uppercase tracking-wide text-emerald-200">Community Feed</p>
        <p className="text-lg font-semibold text-white">No public meals yet</p>
        <p className="text-sm text-white/60">
          Encourage your friends to toggle Public in Settings to appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feed.map((item) => (
        <div
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 md:flex-row"
          key={item.id}
        >
          {item.image_path ? (
            <Image
              alt={item.food_name}
              className="h-32 w-full rounded-xl object-cover md:w-48"
              height={180}
              src={item.image_path}
              width={220}
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-white/40 md:w-48">
              No photo
            </div>
          )}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-200">Shared by</p>
                <p className="text-base font-semibold text-white">{item.profileLabel}</p>
                <p className="text-xs text-white/60">
                  {new Date(item.consumed_at).toLocaleString()}
                </p>
              </div>
              <button
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${item.likedByViewer ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white"}`}
                onClick={() => handleToggleLike(item.id)}
                type="button"
                aria-pressed={item.likedByViewer}
              >
                <span aria-hidden="true">{item.likedByViewer ? "❤️" : "🤍"}</span>
                <span>{pending ? "Updating..." : item.likeCount}</span>
              </button>
            </div>
            <p className="text-lg font-semibold text-white">{item.food_name}</p>
            <div className="flex flex-wrap gap-2 text-xs text-white/70">
              <span className="pill bg-white/10">Weight {item.weight_g}g</span>
              <span className="pill bg-white/10">Kcal {item.calories ?? "—"}</span>
              <span className="pill bg-white/10">Protein {item.protein ?? "—"}g</span>
              <span className="pill bg-white/10">Carbs {item.carbs ?? "—"}g</span>
              <span className="pill bg-white/10">Fat {item.fat ?? "—"}g</span>
              {item.fiber !== undefined && item.fiber !== null ? (
                <span className="pill bg-white/10">Fiber {item.fiber}g</span>
              ) : null}
              {item.sugar !== undefined && item.sugar !== null ? (
                <span className="pill bg-white/10">Sugar {item.sugar}g</span>
              ) : null}
              {item.sodium !== undefined && item.sodium !== null ? (
                <span className="pill bg-white/10">Sodium {item.sodium}mg</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
