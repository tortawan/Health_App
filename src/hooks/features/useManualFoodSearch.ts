import { useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase-browser";
import { generateDraftId } from "@/lib/uuid";
import type { DraftLog, MacroMatch, PortionMemoryRow } from "@/types/food";

type UseManualFoodSearchProps = {
  portionMemories: PortionMemoryRow[];
  onSelect: (draftItem: DraftLog, replaceIndex?: number) => void;
};

export function useManualFoodSearch({ portionMemories, onSelect }: UseManualFoodSearchProps) {
  const [manualOpenIndex, setManualOpenIndex] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MacroMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const runManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setIsSearching(true);
    try {
      let results: MacroMatch[] = [];
      let usedFallback = false;

      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.rpc("match_foods", {
          query_embedding: null,
          query_text: manualQuery,
          match_threshold: 0.0,
          match_count: 10,
          user_id: user?.id ?? null,
        });

        if (error) throw error;
        results = (data ?? []) as MacroMatch[];
        usedFallback = true;
      } catch {
        const res = await fetch(`/api/search?q=${encodeURIComponent(manualQuery)}`);
        if (!res.ok) throw new Error("Search failed");
        results = await res.json();
      }

      setSearchResults(results);
      if (!results.length && usedFallback) {
        toast.error("No results found. Try a broader search.");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const applyManualResult = (match: MacroMatch) => {
    const newDraftItem: DraftLog = {
      id: generateDraftId(),
      food_name: match.description,
      weight: 100,
      match,
      search_term: manualQuery,
    };

    const mem = portionMemories.find(
      (p) => p.food_name.toLowerCase() === match.description.toLowerCase()
    );
    if (mem) {
      newDraftItem.weight = mem.last_weight_g;
    }

    // Pass replacement index if we are editing an existing slot
    const replaceIndex = manualOpenIndex !== null && manualOpenIndex !== -1 ? manualOpenIndex : undefined;
    onSelect(newDraftItem, replaceIndex);
    
    setManualOpenIndex(null);
    setManualQuery("");
    setSearchResults([]);
  };

  return {
    manualOpenIndex,
    setManualOpenIndex,
    manualQuery,
    setManualQuery,
    searchResults,
    isSearching,
    runManualSearch,
    applyManualResult,
  };
}