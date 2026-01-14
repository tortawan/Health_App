"use client";

import React, { useCallback, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  getRecentFoods,
  reportLogIssue,
  logCorrection,
} from "./actions";
import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { CameraCapture } from "../components/scanner/CameraCapture";
import { DailyLogList } from "../components/dashboard/DailyLogList";
import { DraftReview } from "../components/logging/DraftReview";
import { ManualSearchModal } from "../components/logging/ManualSearchModal";
import { generateDraftId } from "@/lib/uuid";
import {
  DraftLog,
  FoodLogRecord,
  MacroMatch,
  MealTemplate,
  PortionMemoryRow,
  RecentFood,
  UserProfile,
} from "../types/food";

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
  initialTemplates = [], 
}: Props) {
  const [dailyLogs, setDailyLogs] = useState<FoodLogRecord[]>(initialLogs);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>(initialRecentFoods);
  const [portionMemories, setPortionMemories] = useState<PortionMemoryRow[]>(initialPortionMemories ?? []);

  const [isLoadingRecentFoods, setIsLoadingRecentFoods] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodLogRecord>>({});
  const [isCopying] = useState(false);
  const [deletingId, setDeletingLogId] = useState<string | null>(null);

  const dailyTotals = useMemo(() => {
    return dailyLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein || 0),
        carbs: acc.carbs + (log.carbs || 0),
        fat: acc.fat + (log.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dailyLogs]);

  const macroTargets = useMemo(() => ({
    protein: initialProfile?.protein_target || 150,
    carbs: initialProfile?.carbs_target || 200,
    fat: initialProfile?.fat_target || 70,
  }), [initialProfile]);
  
  const calorieTarget = initialProfile?.calorie_target || 2500;

  const {
    showScanner,
    setShowScanner,
    draft,
    setDraft,
    isAnalyzing,
    isImageUploading,
    imagePublicUrl,
    handleImageUpload,
    setError,
  } = useScanner();

  useProfileForm(initialProfile);

  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [manualOpenIndex, setManualOpenIndex] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MacroMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateScale, setTemplateScale] = useState(1);
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [flagNotes, setFlagNotes] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);

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
    setPortionMemories((prev) => {
      if (!Array.isArray(prev)) return [];
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

  const handleEditField = (field: keyof FoodLogRecord, value: string | number | null) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };
  const handleBeginEdit = (log: FoodLogRecord) => { setEditingLogId(log.id); setEditForm(log); };
  const handleCancelEdit = () => { setEditingLogId(null); setEditForm({}); };
  const handleSaveEdits = async () => {
     if (!editingLogId) return;
     setDailyLogs(prev => prev.map(log => 
        log.id === editingLogId ? { ...log, ...editForm } as FoodLogRecord : log
     ));
     toast.success("Log updated");
     setEditingLogId(null);
  };
  const handleDeleteLog = async (id: string) => {
      setDeletingLogId(id);
      await new Promise(r => setTimeout(r, 500));
      setDailyLogs(prev => prev.filter(l => l.id !== id));
      toast.success("Entry deleted");
      setDeletingLogId(null);
  }
  const handleShiftDate = (delta: number) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + delta);
      setSelectedDate(date.toISOString().split("T")[0]);
  };

  const handleConfirm = async (index: number) => {
    const item = draft[index];
    if (!item || !item.match) return;
    setError(null);
    setLoggingIndex(index);

    try {
      // Use fetch API route
      const response = await fetch("/api/log-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName: item.food_name,
          weight: item.weight,
          match: item.match,
          imageUrl: imagePublicUrl,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to log food");

      // Robust check: handle if data is Array (Supabase) or Object
      const newEntry = Array.isArray(result.data) ? result.data[0] : result.data;
      
      if (newEntry) {
        setDailyLogs((prev) => [newEntry as FoodLogRecord, ...prev]);
        setDraft((prev) => prev.filter((_, i) => i !== index));
        bumpPortionMemory(item.food_name, item.weight);
        toast.success("Food log saved");
      } else {
        throw new Error("No data returned from API");
      }

      if (item.ai_suggested_weight && Math.abs(item.weight - item.ai_suggested_weight) > 10) {
         await logCorrection({ original: item.ai_suggested_weight, corrected: item.weight, foodName: item.food_name });
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
    const successfulIndices = new Set<number>();
    const currentDraft = draft;

    for (let i = 0; i < currentDraft.length; i++) {
      const item = currentDraft[i];
      if (!item.match) continue; 
      try {
        const response = await fetch("/api/log-food", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ foodName: item.food_name, weight: item.weight, match: item.match, imageUrl: imagePublicUrl }),
        });
        if (response.ok) {
            const result = await response.json();
            const newEntry = Array.isArray(result.data) ? result.data[0] : result.data;
            if (newEntry) {
                setDailyLogs((prev) => [newEntry as FoodLogRecord, ...prev]);
                bumpPortionMemory(item.food_name, item.weight);
                successCount++;
                successfulIndices.add(i);
            }
        }
      } catch (err) { console.error("Failed item", i, err); }
    }

    if (successCount > 0) {
      toast.success(`Saved ${successCount} items`);
      setDraft((prev) => prev.filter((_, index) => !successfulIndices.has(index))); 
      if (successfulIndices.size === currentDraft.length) setShowScanner(false);
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(manualQuery)}`);
      const results = await res.json();
      setSearchResults(results);
    } catch { toast.error("Search failed"); } 
    finally { setIsSearching(false); }
  };

  const applyManualResult = (match: MacroMatch) => {
    if (manualOpenIndex === -1 || manualOpenIndex === null) {
      const newDraftItem: DraftLog = {
        id: generateDraftId(),
        food_name: match.description,
        weight: 100, 
        match,
        search_term: manualQuery,
      };
      const mem = portionMemories.find(p => p.food_name.toLowerCase() === match.description.toLowerCase());
      if (mem) newDraftItem.weight = mem.last_weight_g;
      setDraft([newDraftItem]);
      setShowScanner(true); 
    } else {
      const newDraft = [...draft];
      newDraft[manualOpenIndex] = { ...newDraft[manualOpenIndex], food_name: match.description, match };
      setDraft(newDraft);
    }
    setManualOpenIndex(null); setManualQuery(""); setSearchResults([]);
  };

  const submitFlaggedLog = async () => {
    if (!flaggingLog) return;
    setIsFlagging(true);
    try {
      await reportLogIssue(flaggingLog.id, flagNotes);
      toast.success("Report submitted. Thank you!");
      setFlaggingLog(null); setFlagNotes("");
    } catch { toast.error("Failed to submit report"); } 
    finally { setIsFlagging(false); }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-md px-4 pt-6 space-y-8">
        {(showScanner || draft.length > 0) ? (
          <div className="relative z-10 rounded-2xl bg-[#111] p-4 shadow-2xl ring-1 ring-white/10">
            {draft.length === 0 ? (
              <CameraCapture
                captureMode="photo"
                isUploading={isAnalyzing || isImageUploading}
                isImageUploading={isImageUploading}
                filePreview={imagePublicUrl}
                templateList={initialTemplates}
                selectedTemplateId={selectedTemplateId}
                templateScale={templateScale}
                onTemplateChange={setSelectedTemplateId}
                onTemplateScaleChange={setTemplateScale}
                onApplyTemplate={() => toast("Templates not implemented in demo")}
                onOpenTemplateManager={() => toast("Manager not implemented")}
                isApplyingTemplate={false}
                onFileChange={(file) => file && handleImageUpload(file)}
              />
            ) : (
              <DraftReview
                confidenceLabel="High confidence" 
                draft={draft}
                editingWeightIndex={editingWeightIndex}
                isConfirmingAll={isConfirmingAll}
                isImageUploading={isImageUploading}
                isSavingTemplate={isSavingTemplate}
                loggingIndex={loggingIndex}
                onApplyMatch={(idx, m) => {
                  const d = [...draft]; d[idx].match = m; setDraft(d);
                }}
                onConfirm={handleConfirm}
                onConfirmAll={handleConfirmAll}
                onManualSearch={(idx) => {
                  setManualOpenIndex(idx); setManualQuery(draft[idx].search_term || draft[idx].food_name);
                }}
                onSaveTemplate={() => {}}
                onTemplateNameChange={setTemplateName}
                onToggleWeightEdit={(idx) => setEditingWeightIndex(editingWeightIndex === idx ? null : idx)}
                onUpdateWeight={(idx, w) => { const d = [...draft]; d[idx].weight = w; setDraft(d); }}
                templateName={templateName}
              />
            )}
          </div>
        ) : (
          <>
             <DailyLogList
               dailyLogs={dailyLogs}
               dailyTotals={dailyTotals}
               macroTargets={macroTargets}
               calorieTarget={calorieTarget}
               todayLabel={selectedDate === new Date().toISOString().split("T")[0] ? "Today" : selectedDate}
               selectedDate={selectedDate}
               onShiftDate={handleShiftDate}
               onNavigateToDate={setSelectedDate}
               isCopyingDay={isCopying}
               onCopyYesterday={() => toast("Copy not implemented in demo")}
               editingLogId={editingLogId}
               editForm={editForm}
               onEditField={handleEditField}
               onBeginEdit={handleBeginEdit}
               onSaveEdits={handleSaveEdits}
               onCancelEdit={handleCancelEdit}
               onFlagLog={setFlaggingLog}
               deletingId={deletingId}
               onDeleteLog={handleDeleteLog}
             />
             <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-3">
                <button className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400" onClick={() => setShowScanner(true)} aria-label="Add Log">
                  <span className="text-2xl">+</span>
                </button>
                <button className="rounded-full bg-white/10 p-3 text-sm font-medium text-white backdrop-blur-md" onClick={() => { setManualOpenIndex(-1); setManualQuery(""); }}>
                  Manual Add
                </button>
             </div>
          </>
        )}
      </main>
      {flaggingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-6 ring-1 ring-white/10">
            <h3 className="mb-4 text-lg font-bold text-white">Report an issue</h3>
            <p className="mb-4 text-sm text-white/60">Is the nutrition info for <span className="text-white">{flaggingLog.food_name}</span> incorrect?</p>
            <div className="space-y-4">
              <label className="space-y-1 text-sm text-white/70 sm:col-span-2">
                <span>Notes</span>
                <textarea className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none" value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)}/>
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button className="btn" disabled={isFlagging} onClick={submitFlaggedLog} type="button">{isFlagging ? "Sending..." : "Submit report"}</button>
              <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => setFlaggingLog(null)} type="button">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <ManualSearchModal isLoadingRecentFoods={isLoadingRecentFoods} isSearching={isSearching} onChangeQuery={setManualQuery} onClose={() => setManualOpenIndex(null)} onSearch={runManualSearch} onSelect={applyManualResult} openIndex={manualOpenIndex} query={manualQuery} recentFoods={recentFoods} results={searchResults} />
    </div>
  );
}