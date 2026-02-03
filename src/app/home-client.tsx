"use client";

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import {
  getRecentFoods,
  deleteFoodLog,
  updateFoodLog,
} from "./actions/food";
import { reportLogIssue } from "./actions/community";

import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { useTemplateManagement } from "@/hooks/features/useTemplateManagement";
import { CameraCapture } from "../components/scanner/CameraCapture";
import { DailyLogList } from "../components/dashboard/DailyLogList";
import { DraftReview } from "../components/logging/DraftReview";
import { ManualSearchModal } from "../components/logging/ManualSearchModal";
import { CameraErrorBoundary } from "../components/CameraErrorBoundary";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { TemplateManagerModal } from "@/components/templates/TemplateManagerModal";
import { WaterTracker } from "@/components/tracking/WaterTracker";
import { useWaterTracking } from "@/hooks/tracking/useWaterTracking";
import { generateDraftId } from "@/lib/uuid";
import { adjustedMacros } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase-browser";
import {
  DraftLog,
  FoodLogRecord,
  MacroMatch,
  MealTemplate,
  PortionMemoryRow,
  RecentFood,
  UserProfile,
} from "../types/food";
import type { WaterLog } from "@/types/water";

type Props = {
  initialLogs: FoodLogRecord[];
  initialTemplates: MealTemplate[];
  initialRecentFoods: RecentFood[];
  initialPortionMemories: PortionMemoryRow[];
  initialProfile: UserProfile | null;
  initialWaterLogs: WaterLog[];
  initialSelectedDate: string;
};

type MacroField = "protein" | "carbs" | "fat";

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
  const searchParams = useSearchParams();
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
  const waterTracking = useWaterTracking(initialWaterLogs ?? [], selectedDate);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodLogRecord>>({});
  const [isCopying] = useState(false);
  const [deletingId, setDeletingLogId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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
  const templates = useTemplateManagement(initialTemplates);
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [flagNotes, setFlagNotes] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);
  const optimisticScanIdRef = useRef<string | null>(null);

  const buildOptimisticLog = useCallback(
    (item: DraftLog, consumedAt: string, imageUrl: string | null): FoodLogRecord => {
      const macros = adjustedMacros(item.match ?? undefined, item.weight);
      const macroOverrides = item.macro_overrides ?? {};
      const resolvedMacros = {
        calories: macros?.calories ?? 0,
        protein: Number.isFinite(macroOverrides.protein ?? NaN)
          ? macroOverrides.protein ?? 0
          : macros?.protein ?? 0,
        carbs: Number.isFinite(macroOverrides.carbs ?? NaN)
          ? macroOverrides.carbs ?? 0
          : macros?.carbs ?? 0,
        fat: Number.isFinite(macroOverrides.fat ?? NaN)
          ? macroOverrides.fat ?? 0
          : macros?.fat ?? 0,
      };
      return {
        id: item.id,
        food_name: item.food_name,
        weight_g: item.weight,
        calories: resolvedMacros.calories,
        protein: resolvedMacros.protein,
        carbs: resolvedMacros.carbs,
        fat: resolvedMacros.fat,
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
    usedFallback,
    analysisMessage,
    noFoodDetected,
    queuedCount,
    queueNotice,
    resetAnalysis,
    handleImageUpload,
    setError,
  } = useScanner({
    onAnalysisStart: handleOptimisticScanStart,
    onAnalysisComplete: handleOptimisticScanComplete,
    onAnalysisError: handleOptimisticScanError,
  });
  const isScanning = isAnalyzing || isImageUploading;
  const draftWithDefaults = useMemo(
    () =>
      draft.map((item) => ({
        ...item,
        weight: Number.isFinite(item.weight) ? item.weight : 0,
      })),
    [draft],
  );
  const pathname = usePathname();
  const isHomeRoute = pathname === "/";
  const viewParam = searchParams.get("view");
  const isScannerView = isHomeRoute && (viewParam === "scan" || viewParam === "manual");
  const updateScannerView = useCallback(
    (view: "scan" | "manual" | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view) {
        params.set("view", view);
      } else {
        params.delete("view");
      }
      const query = params.toString();
      router.push(query ? `/?${query}` : "/");
    },
    [router, searchParams],
  );

  const scanErrorFallback = useCallback(
    (error: Error, retry: () => void) => (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-white">
        <h3 className="text-lg font-semibold">Scan failed</h3>
        <p className="mt-2 text-sm text-white/70">
          {error.message || "Something went wrong while scanning your food."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="btn"
            onClick={() => {
              retry();
              updateScannerView("scan");
            }}
            type="button"
          >
            Retry scan
          </button>
          <button
            className="btn bg-white/10 text-white hover:bg-white/20"
            onClick={() => {
              retry();
              updateScannerView(null);
            }}
            type="button"
          >
            Go back
          </button>
        </div>
      </div>
    ),
    [updateScannerView],
  );
  const shouldShowScanner = isHomeRoute && showScanner;

  useEffect(() => {
    if (showScanner !== isScannerView) {
      setShowScanner(isScannerView);
    }
  }, [isScannerView, setShowScanner, showScanner]);

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

  const handleSaveTemplate = useCallback(async () => {
    const items = draftWithDefaults
      .map((item) => ({
        usda_id: item.match?.usda_id,
        grams: item.weight,
      }))
      .filter((item): item is { usda_id: number; grams: number } =>
        Number.isFinite(item.usda_id),
      );

    if (items.length !== draftWithDefaults.length) {
      toast.error("All items must have a USDA match to save a template.");
      return;
    }

    await templates.saveTemplate(templates.templateName, items);
  }, [draftWithDefaults, templates]);

  const handleUpdateMacro = useCallback(
    (index: number, field: MacroField, value: number) => {
      setDraft((prev) => {
        const next = [...prev];
        const item = next[index];
        if (!item) return prev;
        const macroOverrides = { ...(item.macro_overrides ?? {}) };
        macroOverrides[field] = value;
        next[index] = { ...item, macro_overrides: macroOverrides };
        return next;
      });
    },
    [setDraft],
  );

  const handleApplyTemplate = useCallback(async () => {
    if (!templates.selectedTemplateId) return;
    try {
      const inserted = await templates.applyTemplate(
        templates.selectedTemplateId,
        templates.templateScale,
      );
      if (Array.isArray(inserted)) {
        setDailyLogs((prev) => [...inserted, ...prev]);
      }
    } catch (err) {
      console.error(err);
    }
  }, [templates]);

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
    const item = draftWithDefaults[index];
    if (!item || !item.match) return;
    setError(null);
    setLoggingIndex(index);

    try {
      const now = new Date();
      const [year, month, day] = selectedDate.split("-").map(Number);
      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      // Use fetch API route
      const macroOverrides = item.macro_overrides ?? {};
      const payload = {
        foodName: item.food_name,
        weight: item.weight,
        match: item.match,
        imageUrl: imagePublicUrl,
        consumedAt: targetDate.toISOString(),
      } as Record<string, unknown>;
      if (Number.isFinite(macroOverrides.protein ?? NaN)) payload.protein = macroOverrides.protein;
      if (Number.isFinite(macroOverrides.carbs ?? NaN)) payload.carbs = macroOverrides.carbs;
      if (Number.isFinite(macroOverrides.fat ?? NaN)) payload.fat = macroOverrides.fat;

      const response = await fetch("/api/log-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          if (next.length === 0) updateScannerView(null);
          return next;
        });
        bumpPortionMemory(item.food_name, item.weight);
        toast.success("Food log saved");
      } else {
        throw new Error("No data returned from API");
      }

      if (item.ai_suggested_weight && Math.abs(item.weight - item.ai_suggested_weight) > 10) {
        void logWeightCorrection(
          {
            ...item,
            weight: item.ai_suggested_weight,
          },
          item,
        );
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
    const currentDraft = draftWithDefaults;

    for (let i = 0; i < currentDraft.length; i++) {
      const item = currentDraft[i];
      if (!item.match) continue; 
      try {
        const macroOverrides = item.macro_overrides ?? {};
        const payload = {
          foodName: item.food_name,
          weight: item.weight,
          match: item.match,
          imageUrl: imagePublicUrl,
        } as Record<string, unknown>;
        if (Number.isFinite(macroOverrides.protein ?? NaN)) payload.protein = macroOverrides.protein;
        if (Number.isFinite(macroOverrides.carbs ?? NaN)) payload.carbs = macroOverrides.carbs;
        if (Number.isFinite(macroOverrides.fat ?? NaN)) payload.fat = macroOverrides.fat;

        const response = await fetch("/api/log-food", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
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
      if (successfulIndices.size === currentDraft.length) updateScannerView(null);
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
      let results: MacroMatch[] = [];
      let usedFallback = false;

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase.rpc("match_foods", {
          query_embedding: null,
          query_text: manualQuery,
          match_threshold: 0.0,
          match_count: 10,
          user_id: user?.id ?? null,
        });

        if (error) {
          throw error;
        }

        results = (data ?? []) as MacroMatch[];
        usedFallback = true;
      } catch {
        const res = await fetch(`/api/search?q=${encodeURIComponent(manualQuery)}`);
        if (!res.ok) {
          throw new Error("Search failed");
        }
        results = await res.json();
      }

      setSearchResults(results);
      if (!results.length && usedFallback) {
        toast.error("No results found. Try a broader search.");
      }
    } catch { toast.error("Search failed"); } 
    finally { setIsSearching(false); }
  };

  const logWeightCorrection = useCallback(async (original: DraftLog, final: DraftLog) => {
    try {
      await fetch("/api/log-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original,
          final,
          correctedField: "weight",
        }),
      });
    } catch (error) {
      console.warn("[Corrections] Non-blocking log failed", error);
    }
  }, []);

  const logManualCorrection = useCallback(async (originalSearch: string, finalMatchDesc: string) => {
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_search: originalSearch,
          final_match_desc: finalMatchDesc,
          correction_type: "manual_match",
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
      updateScannerView("scan");
    } else {
      const newDraft = [...draft];
      const originalItem = newDraft[manualOpenIndex];
      newDraft[manualOpenIndex] = { ...originalItem, food_name: match.description, match };
      setDraft(newDraft);
      if (originalItem?.match?.description && originalItem.match.description !== match.description) {
        const searchParts = [originalItem.food_name, manualQuery, originalItem.search_term]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));
        const uniqueParts = Array.from(new Set(searchParts));
        const originalSearch = uniqueParts.join(" | ");
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

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-md px-4 pt-6 space-y-8">
        <TemplateManagerModal {...templates} dailyLogs={dailyLogs} />
        <ErrorBoundary fallback={scanErrorFallback}>
          {(shouldShowScanner || draft.length > 0) ? (
            <div className="relative z-10 rounded-2xl bg-[#111] p-4 shadow-2xl ring-1 ring-white/10">
              {draft.length === 0 && isScanning ? (
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
                  <p className="text-base font-semibold">Analyzing your food...</p>
                  <p className="text-xs text-white/60">Gemini + USDA matches in progress.</p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400" />
                  </div>
                </div>
              ) : null}
              {draft.length === 0 ? (
                <CameraErrorBoundary
                  onManualUpload={handleImageUpload}
                  onRetry={() => updateScannerView("scan")}
                >
                  <CameraCapture
                    captureMode="photo"
                    isUploading={isScanning}
                    isImageUploading={isImageUploading}
                    filePreview={imagePublicUrl}
                    templateList={templates.templateList}
                    selectedTemplateId={templates.selectedTemplateId}
                    templateScale={templates.templateScale}
                    onTemplateChange={templates.setSelectedTemplateId}
                    onTemplateScaleChange={templates.setTemplateScale}
                    onApplyTemplate={handleApplyTemplate}
                    onOpenTemplateManager={() => templates.setIsTemplateManagerOpen(true)}
                    isApplyingTemplate={templates.isApplyingTemplate}
                    onFileChange={(file) => file && handleImageUpload(file)}
                    analysisMessage={noFoodDetected ? null : analysisMessage}
                    queuedCount={queuedCount}
                    queueNotice={queueNotice}
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
                            updateScannerView("scan");
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
                  draft={draftWithDefaults}
                  imageSrc={imagePublicUrl}
                  usedFallback={usedFallback}
                  editingWeightIndex={editingWeightIndex}
                  isConfirmingAll={isConfirmingAll}
                  isImageUploading={isImageUploading}
                  isSavingTemplate={templates.isSavingTemplate}
                  loggingIndex={loggingIndex}
                  onApplyMatch={(idx, m) => {
                    const d = [...draftWithDefaults]; d[idx].match = m; setDraft(d);
                  }}
                  onConfirm={handleConfirm}
                  onConfirmAll={handleConfirmAll}
                  onManualSearch={(idx) => {
                    setManualOpenIndex(idx); setManualQuery(draftWithDefaults[idx].search_term || draftWithDefaults[idx].food_name);
                  }}
                  onSaveTemplate={handleSaveTemplate}
                  onTemplateNameChange={templates.setTemplateName}
                  onToggleWeightEdit={(idx) => setEditingWeightIndex(editingWeightIndex === idx ? null : idx)}
                  onUpdateWeight={(idx, w) => { const d = [...draftWithDefaults]; d[idx].weight = w; setDraft(d); }}
                  onUpdateMacro={handleUpdateMacro}
                  templateName={templates.templateName}
                />
              )}
            </div>
          ) : (
            <>
             <WaterTracker {...waterTracking} waterGoal={2000} />
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
                <button className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400" onClick={() => updateScannerView("scan")} aria-label="Add Log">
                  <span className="text-2xl">+</span>
                </button>
                <button className="rounded-full bg-white/10 p-3 text-sm font-medium text-white backdrop-blur-md" onClick={() => { setManualOpenIndex(-1); setManualQuery(""); }}>
                  Manual Add
                </button>
             </div>
          </>
          )}
        </ErrorBoundary>
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
