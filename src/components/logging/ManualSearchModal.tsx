"use client";

import { MacroMatch } from "@/types/food";
import { formatNumber } from "@/lib/format";

type Props = {
  openIndex: number | null;
  query: string;
  onChangeQuery: (value: string) => void;
  results: MacroMatch[];
  onSearch: () => void;
  onClose: () => void;
  onSelect: (match: MacroMatch) => void;
  isSearching: boolean;
  recentFoods: MacroMatch[];
  isLoadingRecentFoods: boolean;
};

export function ManualSearchModal({
  openIndex,
  query,
  onChangeQuery,
  results,
  onSearch,
  onClose,
  onSelect,
  isSearching,
  recentFoods,
  isLoadingRecentFoods,
}: Props) {
  if (openIndex === null) return null;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-200">Manual search</p>
            <h4 className="text-lg font-semibold text-white">Override the AI match</h4>
          </div>
          <button className="text-white/70 hover:text-white" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <input
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            placeholder="Search for a food (e.g., grilled chicken)"
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button className="btn" disabled={isSearching} onClick={onSearch} type="button">
              {isSearching ? "Searching..." : "Search"}
            </button>
            <p className="text-xs text-white/60">Uses the same embedding model + match_foods RPC as the AI path.</p>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {!results.length && !query && recentFoods.length ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-white/50">Recent picks</p>
                {recentFoods.map((result, idx) => (
                  <button className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-emerald-400/70" key={`${result.description}-recent-${idx}`} onClick={() => onSelect(result)} type="button">
                    <p className="text-white">{result.description}</p>
                    <p className="text-sm text-white/70">
                      Kcal {formatNumber(result.kcal_100g)} • Protein {formatNumber(result.protein_100g)}g • Carbs {formatNumber(result.carbs_100g)}g • Fat {formatNumber(result.fat_100g)}g
                    </p>
                    <p className="text-xs text-white/60">
                      Fiber {formatNumber(result.fiber_100g)}g • Sugar {formatNumber(result.sugar_100g)}g • Sodium {formatNumber(result.sodium_100g)}mg
                    </p>
                  </button>
                ))}
              </div>
            ) : null}

            {results.length ? (
              results.map((result, idx) => (
                <button
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-emerald-400/70"
                  key={`${result.description}-${idx}`}
                  onClick={() => onSelect(result)}
                  type="button"
                >
                  <p className="text-white">{result.description}</p>
                  <p className="text-xs text-white/60">
                    Similarity {formatNumber(result.similarity, 2)} • Text rank {formatNumber(result.text_rank, 2)}
                  </p>
                  <p className="text-sm text-white/70">
                    Kcal {formatNumber(result.kcal_100g)} • Protein {formatNumber(result.protein_100g)}g • Carbs {formatNumber(result.carbs_100g)}g • Fat {formatNumber(result.fat_100g)}g
                  </p>
                  <p className="text-xs text-white/60">
                    Fiber {formatNumber(result.fiber_100g)}g • Sugar {formatNumber(result.sugar_100g)}g • Sodium {formatNumber(result.sodium_100g)}mg
                  </p>
                </button>
              ))
            ) : query || !recentFoods.length ? (
              <p className="text-sm text-white/60">{isLoadingRecentFoods ? "Loading recent foods..." : "No results yet. Enter a query to search."}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
