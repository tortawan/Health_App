"use client";

import React, { useCallback, useState } from "react";
import toast from "react-hot-toast";
import {
  manualSearch,
  getRecentFoods,
  reportLogIssue,
  submitLogFood,
  logCorrection,
} from "./actions";
import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { CameraCapture } from "@/components/scanner/CameraCapture";
import { DailyLogList } from "@/components/dashboard/DailyLogList";
import { DraftReview } from "@/components/logging/DraftReview";
import { ManualSearchModal } from "@/components/logging/ManualSearchModal";
import {
  DraftLog,
  FoodLogRecord,
  MacroMatch,
  MealTemplate,
  PortionMemoryRow,
  RecentFood,
  UserProfile,
} from "@/types/food";

type Props = {
  initialLogs: FoodLogRecord[];
  initialProfile: UserProfile | null;
  initialStreak: number;
  initialTemplates: MealTemplate[];
  initialRecentFoods: RecentFood[];
  initialPortionMemories: PortionMemoryRow[];
};

export default function HomeClient({
  initialLogs,
  initialProfile,
  initialRecentFoods,
  initialPortionMemories,
}: Props) {
  const [dailyLogs, setDailyLogs] = useState<FoodLogRecord[]>(initialLogs);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>(initialRecentFoods);
  const [portionMemories, setPortionMemories] = useState<PortionMemoryRow[]>(initialPortionMemories);

  const [isLoadingRecentFoods, setIsLoadingRecentFoods] = useState(false);

  // Scanner Hook
  const {
    showScanner,
    setShowScanner,
    draft,
    setDraft,
    isAnalyzing,
    isImageUploading,
    imagePublicUrl,
    handleCapture,
    handleImageUpload,
    error,
    setError,
  } = useScanner();

  // Profile Hook
  useProfileForm(initialProfile);

  // Local State for Logging
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

  // Manual Search State
  const [manualOpenIndex, setManualOpenIndex] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MacroMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Template Saving State
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate] = useState(false); // Setter was unused

  // Editing / Deleting Log
  const [, setEditingLog] = useState<FoodLogRecord | null>(null); // Value unused
  const [, setDeletingLogId] = useState<number | null>(null); // Value unused

  // Flagging
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [flagNotes, setFlagNotes] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);

  // --- Helpers ---
  const refreshRecentFoods = useCallback(async () => {
    setIsLoadingRecentFoods(true);
    try {
      const data = await getRecentFoods();
      if (data) setRecentFoods(data);
    } catch (err) {
      console.error("Failed to refresh recent foods", err);
    } finally {
      setIsLoadingRecentFoods(false);
    }
  }, []);

  const bumpPortionMemory = (foodName: string, weight: number) => {
    // Optimistic update
    setPortionMemories((prev) => {
      const existing = prev.findIndex(
        (p) => p.food_name.toLowerCase() === foodName.toLowerCase(),
      );
      if (existing !== -1) {
        const copy = [...prev];
        copy[existing] = { ...copy[existing], last_weight_g: weight, usages: copy[existing].usages + 1 };
        return copy;
      }
      return [
        ...prev,
        { id: -1, user_id: "", food_name: foodName, last_weight_g: weight, usages: 1, created_at: "" },
      ];
    });
  };

  // --- Actions ---

  const handleConfirm = async (index: number) => {
    const item = draft[index];
    if (!item || !item.match) return;
    setError(null);
    setLoggingIndex(index);

    try {
      // 1. Submit
      const result = await submitLogFood({
        foodName: item.food_name,
        weight: item.weight,
        match: item.match,
        imageUrl: imagePublicUrl,
      });

      if (result.queued) {
        toast.success("Offline — queued for sync once you reconnect");
      } else if (result.data) {
        setDailyLogs((prev) => [result.data as FoodLogRecord, ...prev]);
        
        // ✅ CRITICAL FIX: Remove item from draft so it doesn't duplicate in the UI
        setDraft((prev) => prev.filter((_, i) => i !== index));
        
        bumpPortionMemory(item.food_name, item.weight);
        toast.success("Food log saved");
      } else {
        throw new Error(result.error || "Failed to log food");
      }

      // 2. If weight changed significantly
      if (item.ai_suggested_weight && Math.abs(item.weight - item.ai_suggested_weight) > 10) {
         await logCorrection({
           original: item.ai_suggested_weight,
           corrected: item.weight,
           foodName: item.food_name
         });
      }

      refreshRecentFoods();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoggingIndex(null);
    }
  };

  const handleConfirmAll = async () => {
    setIsConfirmingAll(true);
    setError(null);
    let successCount = 0;

    for (let i = 0; i < draft.length; i++) {
      const item = draft[i];
      if (!item.match) continue; // skip un-matched items
      try {
        const result = await submitLogFood({
          foodName: item.food_name,
          weight: item.weight,
          match: item.match,
          imageUrl: imagePublicUrl, // attach same image to all? or only first?
        });
        if (result.data || result.queued) {
          if (result.data) {
            setDailyLogs((prev) => [result.data as FoodLogRecord, ...prev]);
            bumpPortionMemory(item.food_name, item.weight);
          }
          successCount++;
        }
      } catch (err) {
        console.error("Failed item", i, err);
      }
    }

    if (successCount > 0) {
      toast.success(`Saved ${successCount} items`);
      setDraft([]); // Clear all drafts
      setShowScanner(false);
      refreshRecentFoods();
    } else {
      toast.error("No items saved. Please check matches.");
    }
    setIsConfirmingAll(false);
  };

  const runManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await manualSearch(manualQuery);
      setSearchResults(results);
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const applyManualResult = (match: MacroMatch) => {
    if (manualOpenIndex === null) {
      // "Quick Add" mode (no draft item)
      const newDraftItem: DraftLog = {
        food_name: match.description,
        weight: 100, // default
        match,
        search_term: manualQuery,
      };
      // Check portion memory
      const mem = portionMemories.find(
        (p) => p.food_name.toLowerCase() === match.description.toLowerCase(),
      );
      if (mem) {
        newDraftItem.weight = mem.last_weight_g;
      }

      setDraft([newDraftItem]);
      setShowScanner(true); 
    } else {
      // Updating an existing draft item
      const newDraft = [...draft];
      newDraft[manualOpenIndex] = {
        ...newDraft[manualOpenIndex],
        food_name: match.description,
        match,
      };
      setDraft(newDraft);
    }
    setManualOpenIndex(null);
    setManualQuery("");
    setSearchResults([]);
  };

  const submitFlaggedLog = async () => {
    if (!flaggingLog) return;
    setIsFlagging(true);
    try {
      await reportLogIssue(flaggingLog.id, flagNotes);
      toast.success("Report submitted. Thank you!");
      setFlaggingLog(null);
      setFlagNotes("");
    } catch {
      toast.error("Failed to submit report");
    } finally {
      setIsFlagging(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header / Profile / Scanner Toggle / Feed */}
      {/* ... (Render code for header, stats, etc.) ... */}
      
      {/* Main Content Area */}
      <main className="mx-auto max-w-md px-4 pt-6 space-y-8">
        
        {/* If Scanner Open OR Draft Exists */}
        {(showScanner || draft.length > 0) ? (
          <div className="relative z-10 rounded-2xl bg-[#111] p-4 shadow-2xl ring-1 ring-white/10">
            {draft.length === 0 ? (
              <CameraCapture
                isAnalyzing={isAnalyzing}
                onCapture={handleCapture}
                onClose={() => setShowScanner(false)}
                onUpload={handleImageUpload}
                error={error}
              />
            ) : (
              <DraftReview
                confidenceLabel="High confidence" // simplified
                draft={draft}
                editingWeightIndex={editingWeightIndex}
                isConfirmingAll={isConfirmingAll}
                isImageUploading={isImageUploading}
                isSavingTemplate={isSavingTemplate}
                loggingIndex={loggingIndex}
                onApplyMatch={(idx, m) => {
                  const d = [...draft];
                  d[idx].match = m;
                  setDraft(d);
                }}
                onConfirm={handleConfirm}
                onConfirmAll={handleConfirmAll}
                onManualSearch={(idx) => {
                  setManualOpenIndex(idx);
                  setManualQuery(draft[idx].search_term || draft[idx].food_name);
                }}
                onSaveTemplate={() => {
                  // ... impl ...
                }}
                onTemplateNameChange={setTemplateName}
                onToggleWeightEdit={(idx) => {
                  setEditingWeightIndex(editingWeightIndex === idx ? null : idx);
                }}
                onUpdateWeight={(idx, w) => {
                  const d = [...draft];
                  d[idx].weight = w;
                  setDraft(d);
                }}
                templateName={templateName}
              />
            )}
          </div>
        ) : (
          /* Dashboard View */
          <>
             {/* ... Stats Cards ... */}
             
             <DailyLogList
               logs={dailyLogs}
               onDelete={(id) => setDeletingLogId(id)}
               onEdit={(log) => setEditingLog(log)}
               onFlag={(log) => setFlaggingLog(log)}
             />
             
             {/* FAB or "Add Log" buttons */}
             <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-3">
                <button 
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400"
                  onClick={() => setShowScanner(true)}
                  aria-label="Add Log"
                >
                  <span className="text-2xl">+</span>
                </button>
                {/* Secondary "Manual" button just for test flow visibility if needed */}
                <button
                   className="rounded-full bg-white/10 p-3 text-sm font-medium text-white backdrop-blur-md"
                   onClick={() => {
                     setManualOpenIndex(null); // mode = new item
                     setManualQuery("");
                   }}
                >
                  Manual Add
                </button>
             </div>
          </>
        )}
      </main>

      {/* Modals (Manual Search, Edit, Flag) */}
      
      {/* Flag Modal */}
      {flaggingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-6 ring-1 ring-white/10">
            <h3 className="mb-4 text-lg font-bold text-white">Report an issue</h3>
            <p className="mb-4 text-sm text-white/60">
              Is the nutrition info for <span className="text-white">{flaggingLog.food_name}</span> incorrect?
            </p>
            <div className="space-y-4">
              <label className="space-y-1 text-sm text-white/70 sm:col-span-2">
                <span>Notes</span>
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button className="btn" disabled={isFlagging} onClick={submitFlaggedLog} type="button">
                {isFlagging ? "Sending..." : "Submit report"}
              </button>
              <button
                className="btn bg-white/10 text-white hover:bg-white/20"
                onClick={() => setFlaggingLog(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ManualSearchModal
        isLoadingRecentFoods={isLoadingRecentFoods}
        isSearching={isSearching}
        onChangeQuery={setManualQuery}
        onClose={() => setManualOpenIndex(null)}
        onSearch={runManualSearch}
        onSelect={applyManualResult}
        openIndex={manualOpenIndex}
        query={manualQuery}
        recentFoods={recentFoods}
        results={searchResults}
      />
      
      {/* ... Edit Modal ... */}
    </div>
  );
}