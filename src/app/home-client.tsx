"use client";

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  getRecentFoods,
  deleteFoodLog,
  deleteWaterLog,
  logWater,
  updateFoodLog,
  updateWaterLog,
  reportLogIssue,
  logCorrection,
} from "./actions";
import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { CameraCapture } from "../components/scanner/CameraCapture";
import { DailyLogList } from "../components/dashboard/DailyLogList";
import { DraftReview } from "../components/logging/DraftReview";
import { ManualSearchModal } from "../components/logging/ManualSearchModal";
import { CameraErrorBoundary } from "../components/CameraErrorBoundary";
import { generateDraftId } from "@/lib/uuid";
import { adjustedMacros } from "@/lib/nutrition";
import {
  DraftLog,
  FoodLogRecord,
  MacroMatch,
  MealTemplate,
  PortionMemoryRow,
  RecentFood,
  UserProfile,
} from "../types/food";

type WaterLog = {
  id: string;
  amount_ml: number;
  logged_at: string;
  isOptimistic?: boolean;
};

type Props = {
  initialLogs: FoodLogRecord[];
  initialTemplates: MealTemplate[];
  initialRecentFoods: RecentFood[];
  initialPortionMemories: PortionMemoryRow[];
  initialProfile: UserProfile | null;
  initialWaterLogs: WaterLog[];
  initialSelectedDate: string;
};

export default function HomeClient({
  initialLogs,
  initialRecentFoods,
  initialPortionMemories,
  initialProfile,
  initialTemplates = [],
  initialWaterLogs,
  initialSelectedDate,
}: Props) {
  const router = useRouter();
  const [dailyLogs, setDailyLogs] = useState<FoodLogRecord[]>(initialLogs);
  useEffect(() => {
    setDailyLogs(initialLogs);
  }, [initialLogs]);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>(initialRecentFoods);
  const [portionMemories, setPortionMemories] = useState<PortionMemoryRow[]>(initialPortionMemories ?? []);

  const [isLoadingRecentFoods, setIsLoadingRecentFoods] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    initialSelectedDate ?? new Date().toISOString().split("T")[0],
  );
  useEffect(() => {
    if (initialSelectedDate) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodLogRecord>>({});
  const [isCopying] = useState(false);
  const [deletingId, setDeletingLogId] = useState<string | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>(initialWaterLogs ?? []);
  const [waterAmount, setWaterAmount] = useState(250);
  const [waterSaving, setWaterSaving] = useState(false);
  const [editingWaterId, setEditingWaterId] = useState<string | null>(null);
  const [editingWaterAmount, setEditingWaterAmount] = useState<number>(0);
  const [deletingWaterId, setDeletingWaterId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setWaterLogs(initialWaterLogs ?? []);
  }, [initialWaterLogs]);

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
  const optimisticScanIdRef = useRef<string | null>(null);
  const waterGoal = 2000;
  const waterTotal = useMemo(
    () => waterLogs.reduce((total, log) => total + Number(log.amount_ml ?? 0), 0),
    [waterLogs],
  );
  const waterProgress = Math.min(waterTotal / waterGoal, 1);

  const buildOptimisticLog = useCallback(
    (item: DraftLog, consumedAt: string, imageUrl: string | null): FoodLogRecord => {
      const macros = adjustedMacros(item.match ?? undefined, item.weight);
      return {
        id: item.id,
        food_name: item.food_name,
        weight_g: item.weight,
        calories: macros?.calories ?? 0,
        protein: macros?.protein ?? 0,
        carbs: macros?.carbs ?? 0,
        fat: macros?.fat ?? 0,
        consumed_at: consumedAt,
        image_path: imageUrl,
      } as FoodLogRecord;
    },
    [],
  );

  const handleOptimisticScanStart = useCallback(() => {
    const scanId = generateDraftId();
    optimisticScanIdRef.current = scanId;
    setDailyLogs((prev) => [
      {
        id: scanId,
        food_name: "Scanning...",
        weight_g: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        consumed_at: new Date().toISOString(),
        image_path: null,
      } as FoodLogRecord,
      ...prev,
    ]);
  }, []);

  const handleOptimisticScanComplete = useCallback(
    ({ draft: draftItems, imageUrl }: { draft: DraftLog[]; imageUrl: string | null }) => {
      const consumedAt = new Date().toISOString();
      setDailyLogs((prev) => {
        const currentScanId = optimisticScanIdRef.current;
        const withoutScan = currentScanId
          ? prev.filter((log) => log.id !== currentScanId)
          : prev;
        const optimisticEntries = draftItems.map((item) =>
          buildOptimisticLog(item, consumedAt, imageUrl),
        );
        return [...optimisticEntries, ...withoutScan];
      });
      optimisticScanIdRef.current = null;
    },
    [buildOptimisticLog],
  );

  const handleOptimisticScanError = useCallback(
    (message: string) => {
      const currentScanId = optimisticScanIdRef.current;
      if (currentScanId) {
        setDailyLogs((prev) => prev.filter((log) => log.id !== currentScanId));
        optimisticScanIdRef.current = null;
      }
      void message;
    },
    [],
  );

  const {
    showScanner,
    setShowScanner,
    stopScanning,
    draft,
    setDraft,
    isAnalyzing,
    isImageUploading,
    imagePublicUrl,
    analysisMessage,
    noFoodDetected,
    resetAnalysis,
    handleImageUpload,
    setError,
  } = useScanner({
    onAnalysisStart: handleOptimisticScanStart,
    onAnalysisComplete: handleOptimisticScanComplete,
    onAnalysisError: handleOptimisticScanError,
  });
  const pathname = usePathname();
  const isHomeRoute = pathname === "/";
  const shouldShowScanner = isHomeRoute && showScanner;

  useEffect(() => {
    if (!isHomeRoute) {
      stopScanning();
    }
  }, [isHomeRoute, stopScanning]);

  useEffect(() => {
    return () => stopScanning();
  }, [stopScanning]);

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
    if (field !== "weight_g") {
      setEditForm(prev => ({ ...prev, [field]: value }));
      return;
    }

    const newWeight = Number(value);
    const originalLog = dailyLogs.find(log => log.id === editingLogId);

    if (!originalLog || originalLog.weight_g === 0) {
      setEditForm(prev => ({ ...prev, weight_g: newWeight }));
      return;
    }

    const ratio = newWeight / originalLog.weight_g;

    setEditForm(prev => ({
      ...prev,
      weight_g: newWeight,
      calories: Math.round((originalLog.calories || 0) * ratio),
      protein: Math.round((originalLog.protein || 0) * ratio * 10) / 10,
      carbs: Math.round((originalLog.carbs || 0) * ratio * 10) / 10,
      fat: Math.round((originalLog.fat || 0) * ratio * 10) / 10,
    }));
  };
  const handleBeginEdit = (log: FoodLogRecord) => { setEditingLogId(log.id); setEditForm(log); };
  const handleCancelEdit = () => { setEditingLogId(null); setEditForm({}); };
  const handleSaveEdits = async () => {
     if (!editingLogId) return;
     const previousLogs = dailyLogs;
     setDailyLogs(prev => prev.map(log =>
        log.id === editingLogId ? { ...log, ...editForm } as FoodLogRecord : log
     ));
     setEditingLogId(null);
     try {
       await updateFoodLog(editingLogId, {
         weight_g: editForm.weight_g,
         calories: editForm.calories ?? null,
         protein: editForm.protein ?? null,
         carbs: editForm.carbs ?? null,
         fat: editForm.fat ?? null,
       });
       toast.success("Log updated");
     } catch (err) {
       console.error(err);
       setDailyLogs(previousLogs);
       toast.error(err instanceof Error ? err.message : "Unable to update log");
     }
  };
  const handleDeleteLog = async (id: string) => {
      const previousLogs = dailyLogs;
      setDeletingLogId(id);
      setDailyLogs(prev => prev.filter(l => l.id !== id));
      try {
        await deleteFoodLog(id);
        toast.success("Entry deleted");
      } catch (err) {
        console.error(err);
        setDailyLogs(previousLogs);
        toast.error(err instanceof Error ? err.message : "Unable to delete entry");
      } finally {
        setDeletingLogId(null);
      }
  }
  const handleShiftDate = (delta: number) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + delta);
      const newDateStr = date.toISOString().split("T")[0];
      setSelectedDate(newDateStr);
      router.push(`/?date=${newDateStr}`);
  };

  const handleConfirm = async (index: number) => {
    const item = draft[index];
    if (!item || !item.match) return;
    setError(null);
    setLoggingIndex(index);

    try {
      const now = new Date();
      const [year, month, day] = selectedDate.split("-").map(Number);
      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      // Use fetch API route
      const response = await fetch("/api/log-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodName: item.food_name,
          weight: item.weight,
          match: item.match,
          imageUrl: imagePublicUrl,
          consumedAt: targetDate.toISOString(),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to log food");

      // Robust check: handle if data is Array (Supabase) or Object
      const newEntry = Array.isArray(result.data) ? result.data[0] : result.data;
      
      if (newEntry) {
        setDailyLogs((prev) => [
          newEntry as FoodLogRecord,
          ...prev.filter((log) => log.id !== item.id),
        ]);
        setDraft((prev) => {
          const next = prev.filter((_, i) => i !== index);
          if (next.length === 0) setShowScanner(false);
          return next;
        });
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
                setDailyLogs((prev) => [
                  newEntry as FoodLogRecord,
                  ...prev.filter((log) => log.id !== item.id),
                ]);
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

  const logManualCorrection = useCallback(async (originalSearch: string, finalMatchDesc: string) => {
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_search: originalSearch,
          final_match_desc: finalMatchDesc,
        }),
      });
      if (!response.ok) {
        console.warn("[Corrections] Failed to log correction", await response.json());
      }
    } catch (error) {
      console.warn("[Corrections] Non-blocking log failed", error);
    }
  }, []);

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
      const originalItem = newDraft[manualOpenIndex];
      newDraft[manualOpenIndex] = { ...originalItem, food_name: match.description, match };
      setDraft(newDraft);
      if (
        originalItem?.match?.description &&
        originalItem.match.description !== match.description
      ) {
        const originalSearch = originalItem.search_term || originalItem.food_name || "";
        void logManualCorrection(originalSearch, match.description);
      }
    }
    setManualOpenIndex(null); setManualQuery(""); setSearchResults([]);
  };

  const submitFlaggedLog = async () => {
    if (!flaggingLog) return;
    setIsFlagging(true);
    try {
      await reportLogIssue(flaggingLog.id, { notes: flagNotes });
      toast.success("Report submitted. Thank you!");
      setFlaggingLog(null); setFlagNotes("");
    } catch { toast.error("Failed to submit report"); } 
    finally { setIsFlagging(false); }
  };

  const handleAddWater = async (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setWaterSaving(true);
    const optimisticId = `water_${Date.now()}`;
    const optimisticLog: WaterLog = {
      id: optimisticId,
      amount_ml: amount,
      logged_at: new Date().toISOString(),
      isOptimistic: true,
    };
    setWaterLogs((prev) => [optimisticLog, ...prev]);
    try {
      const saved = await logWater(amount);
      setWaterLogs((prev) =>
        prev.map((log) => (log.id === optimisticId ? { ...saved } : log)),
      );
      toast.success("Water logged");
      setWaterAmount(amount);
    } catch (err) {
      console.error(err);
      setWaterLogs((prev) => prev.filter((log) => log.id !== optimisticId));
      toast.error(err instanceof Error ? err.message : "Unable to log water");
    } finally {
      setWaterSaving(false);
    }
  };

  const startEditWater = (log: WaterLog) => {
    setEditingWaterId(log.id);
    setEditingWaterAmount(log.amount_ml);
  };

  const handleUpdateWater = async () => {
    if (!editingWaterId) return;
    const updatedAmount = Number(editingWaterAmount);
    if (!Number.isFinite(updatedAmount) || updatedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const previousLogs = waterLogs;
    setWaterLogs((prev) =>
      prev.map((log) =>
        log.id === editingWaterId ? { ...log, amount_ml: updatedAmount } : log,
      ),
    );
    setEditingWaterId(null);
    try {
      await updateWaterLog(editingWaterId, updatedAmount);
      toast.success("Water updated");
    } catch (err) {
      console.error(err);
      setWaterLogs(previousLogs);
      toast.error(err instanceof Error ? err.message : "Unable to update water");
    }
  };

  const handleDeleteWater = async (id: string) => {
    const previousLogs = waterLogs;
    setDeletingWaterId(id);
    setWaterLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await deleteWaterLog(id);
      toast.success("Water deleted");
    } catch (err) {
      console.error(err);
      setWaterLogs(previousLogs);
      toast.error(err instanceof Error ? err.message : "Unable to delete water");
    } finally {
      setDeletingWaterId(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-md px-4 pt-6 space-y-8">
        {(shouldShowScanner || draft.length > 0) ? (
          <div className="relative z-10 rounded-2xl bg-[#111] p-4 shadow-2xl ring-1 ring-white/10">
            {draft.length === 0 ? (
              <CameraErrorBoundary
                onManualUpload={handleImageUpload}
                onRetry={() => setShowScanner(true)}
              >
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
                  analysisMessage={noFoodDetected ? null : analysisMessage}
                  fileInputRef={photoInputRef}
                />
                {noFoodDetected && !isAnalyzing && !isImageUploading && (
                  <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <p className="text-base font-semibold">
                      We couldn&apos;t detect any food in that photo.
                    </p>
                    <p className="mt-1 text-white/70">
                      Try another angle, upload a new photo, or log manually.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="btn"
                        onClick={() => {
                          resetAnalysis();
                          setShowScanner(true);
                        }}
                        type="button"
                      >
                        Try again
                      </button>
                      <button
                        className="btn bg-white/10 text-white hover:bg-white/20"
                        onClick={() => photoInputRef.current?.click()}
                        type="button"
                      >
                        Upload another photo
                      </button>
                      <button
                        className="btn bg-white/10 text-white hover:bg-white/20"
                        onClick={() => {
                          setManualOpenIndex(-1);
                          setManualQuery("");
                        }}
                        type="button"
                      >
                        Search manually
                      </button>
                    </div>
                  </div>
                )}
              </CameraErrorBoundary>
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
             <section className="card space-y-4">
               <div className="flex items-center justify-between">
                 <div>
                   <p className="text-sm uppercase tracking-wide text-emerald-200">Water</p>
                   <h2 className="text-xl font-semibold text-white">Hydration tracker</h2>
                   <p className="text-sm text-white/60">
                     Today&apos;s total: {waterTotal} ml • Goal {waterGoal} ml
                   </p>
                 </div>
                 <span className="pill bg-white/10 text-white/70">Daily goal</span>
               </div>
               <div className="space-y-2">
                 <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                   <div
                     className="h-full rounded-full bg-emerald-400 transition-all"
                     style={{ width: `${waterProgress * 100}%` }}
                   />
                 </div>
                 <div className="text-xs text-white/60">
                   {Math.round(waterProgress * 100)}% of goal
                 </div>
               </div>
               <div className="flex flex-wrap items-end gap-3">
                 <label className="space-y-1 text-sm text-white/70">
                   <span className="block text-xs uppercase tracking-wide text-white/60">
                     Amount (ml)
                   </span>
                   <input
                     className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                     min={50}
                     step={50}
                     type="number"
                     value={waterAmount}
                     onChange={(event) => setWaterAmount(Number(event.target.value))}
                   />
                 </label>
                 <button
                   className="btn"
                   disabled={waterSaving}
                   onClick={() => handleAddWater(waterAmount)}
                   type="button"
                 >
                   {waterSaving ? "Saving..." : "Add water"}
                 </button>
                 <div className="flex flex-wrap gap-2">
                   {[250, 500, 750, 1000].map((amount) => (
                     <button
                       className="pill bg-white/10 text-white hover:bg-white/20"
                       key={amount}
                       onClick={() => handleAddWater(amount)}
                       type="button"
                     >
                       +{amount} ml
                     </button>
                   ))}
                 </div>
               </div>
               {waterLogs.length === 0 ? (
                 <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
                   No water logs yet. Add your first entry to start tracking.
                 </div>
               ) : (
                 <div className="space-y-2">
                   <p className="text-xs uppercase tracking-wide text-white/50">Recent entries</p>
                   {waterLogs.slice(0, 5).map((log) => (
                     <div
                       className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white/80"
                       key={log.id}
                     >
                       {editingWaterId === log.id ? (
                         <div className="flex flex-wrap items-center gap-2">
                           <input
                             className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                             min={50}
                             step={50}
                             type="number"
                             value={editingWaterAmount}
                             onChange={(event) => setEditingWaterAmount(Number(event.target.value))}
                           />
                           <button className="btn" onClick={handleUpdateWater} type="button">
                             Save
                           </button>
                           <button
                             className="btn bg-white/10 text-white hover:bg-white/20"
                             onClick={() => setEditingWaterId(null)}
                             type="button"
                           >
                             Cancel
                           </button>
                         </div>
                       ) : (
                         <>
                           <div>
                             <p className="text-base font-semibold text-white">{log.amount_ml} ml</p>
                             <p className="text-xs text-white/60">
                               {new Date(log.logged_at).toLocaleTimeString([], {
                                 hour: "numeric",
                                 minute: "2-digit",
                               })}
                             </p>
                           </div>
                           <div className="flex items-center gap-2">
                             <button
                               className="pill bg-white/10 text-white hover:bg-white/20"
                               onClick={() => startEditWater(log)}
                               type="button"
                             >
                               ✏️ Edit
                             </button>
                             <button
                               className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
                               disabled={deletingWaterId === log.id}
                               onClick={() => handleDeleteWater(log.id)}
                               type="button"
                             >
                               {deletingWaterId === log.id ? "Deleting..." : "🗑️ Delete"}
                             </button>
                           </div>
                         </>
                       )}
                     </div>
                   ))}
                 </div>
               )}
             </section>
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
             <div className="scanner-container right-4 flex flex-col gap-3">
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
