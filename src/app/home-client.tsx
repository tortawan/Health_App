"use client";

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

// --- UPDATED IMPORTS ---
import {
  getRecentFoods,
  deleteFoodLog,
  updateFoodLog,
} from "./actions/food";
import {
  deleteWaterLog,
  logWater,
  updateWaterLog,
} from "./actions/tracking";
import { reportLogIssue } from "./actions/community";
import {
  applyMealTemplate,
  deleteMealTemplate,
  saveMealTemplate,
  saveMealTemplateFromLogs,
} from "./actions/templates";
// -----------------------

import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { CameraCapture } from "../components/scanner/CameraCapture";
import { DailyLogList } from "../components/dashboard/DailyLogList";
import { DraftReview } from "../components/logging/DraftReview";
import ErrorBoundary from "../components/ErrorBoundary";
import CameraErrorBoundary from "../components/CameraErrorBoundary";
import { ManualSearchModal } from "../components/logging/ManualSearchModal";
import { createClient } from "@/lib/supabase-browser";
import {
  FoodLogRecord,
  MacroMatch,
  DraftLog,
  RecentFood,
  PortionMemoryRow,
  UserProfile,
  MealTemplate,
  LogCorrection,
} from "@/types/food";
import { logManualCorrection, logWeightCorrection } from "./actions/utils";
import { generateDraftId } from "@/lib/uuid";

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
  const [templateList, setTemplateList] = useState<MealTemplate[]>(initialTemplates);
  useEffect(() => {
    setTemplateList(initialTemplates);
  }, [initialTemplates]);

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
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [flagNotes, setFlagNotes] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);

  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MacroMatch[]>([]);
  const [manualOpenIndex, setManualOpenIndex] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [templateScale, setTemplateScale] = useState(1.0);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const {
    profile,
    calorieTarget,
    macroTargets,
    isLoading: isProfileLoading,
    updateProfile,
  } = useProfileForm(initialProfile);

  const dailyTotals = useMemo(() => {
    return dailyLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein || 0),
        carbs: acc.carbs + (log.carbs || 0),
        fat: acc.fat + (log.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [dailyLogs]);

  const bumpPortionMemory = useCallback(
    (foodName: string, weightG: number) => {
      setPortionMemories((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (m) => m.food_name.toLowerCase() === foodName.toLowerCase(),
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            weight_g:
              (next[idx].weight_g * next[idx].count + weightG) /
              (next[idx].count + 1),
            count: next[idx].count + 1,
            last_weight_g: weightG,
          };
        } else {
          next.push({
            food_name: foodName,
            weight_g: weightG,
            count: 1,
            last_weight_g: weightG,
          });
        }
        return next.sort((a, b) => b.count - a.count);
      });
    },
    [],
  );

  const handleOptimisticScanStart = useCallback(() => {}, []);
  const handleOptimisticScanComplete = useCallback(() => {}, []);
  const handleOptimisticScanError = useCallback(() => {
    toast.error("Scan failed");
  }, []);

  const {
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
      setShowScanner(Boolean(isScannerView));
    }
  }, [isScannerView, setShowScanner, showScanner]);

  const stopScanning = useCallback(() => {
      // Logic to stop scanning if needed, mainly handled by unmount or view change
      // Currently empty as scanner hook handles cleanup
  }, []);

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
    const name = templateName.trim();
    if (!name) {
      toast.error("Please enter a template name");
      return;
    }
    setIsSavingTemplate(true);
    try {
      const template = await saveMealTemplateFromLogs(name, dailyLogs);
      if (template) {
        setTemplateList((prev) => [template, ...prev]);
        toast.success("Meal saved as template");
        setTemplateName("");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save template");
    } finally {
      setIsSavingTemplate(false);
    }
  }, [dailyLogs, templateName]);

  const handleDeleteTemplate = async (id: string) => {
      if (!confirm("Delete this template?")) return;
      try {
          await deleteMealTemplate(id);
          setTemplateList(prev => prev.filter(t => t.id !== id));
          toast.success("Template deleted");
      } catch {
          toast.error("Failed to delete template");
      }
  };

  const handleApplyTemplate = async (templateId: string) => {
    const template = templateList.find((t) => t.id === templateId);
    if (!template) return;
    setIsApplyingTemplate(true);
    try {
        const result = await applyMealTemplate(templateId, new Date().toISOString(), templateScale);
        if (result && result.length > 0) {
            setDailyLogs((prev) => [...result, ...prev]);
            toast.success(`Added ${result.length} items from template`);
            setSelectedTemplateId(null);
            updateScannerView(null);
        }
    } catch (err) {
        console.error(err);
        toast.error("Failed to apply template");
    } finally {
        setIsApplyingTemplate(false);
    }
  };

  const logFoodItem = async (
    item: DraftLog,
    index: number,
    macroOverrides: { protein?: number; carbs?: number; fat?: number } = {},
  ) => {
    if (!item.match) {
      toast.error("Please select a food match first");
      return;
    }
    setLoggingIndex(index);
    try {
      const targetDate = new Date();
      if (selectedDate !== new Date().toISOString().split("T")[0]) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        targetDate.setFullYear(y, m - 1, d);
      }

      const payload = {
        food_name: item.match.description, 
        weight_g: item.weight,
        match_id: item.match.id,
        image_url: item.image_url,
        image_path: item.image_path,
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

  const confirmAllDrafts = async () => {
    setIsConfirmingAll(true);
    let successCount = 0;
    const currentDraft = [...draft];
    const successfulIndices = new Set<number>();
    const targetDate = new Date();

    if (selectedDate !== new Date().toISOString().split("T")[0]) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        targetDate.setFullYear(y, m - 1, d);
    }

    for (let i = 0; i < currentDraft.length; i++) {
      const item = currentDraft[i];
      if (!item.match) continue; 

      try {
        const payload = {
            food_name: item.match.description,
            weight_g: item.weight,
            match_id: item.match.id,
            image_url: item.image_url,
            image_path: item.image_path,
            consumedAt: targetDate.toISOString(),
        };

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
          data: { session },
        } = await supabase.auth.getSession();
        const { data, error } = await supabase.rpc("match_foods", {
          query_embedding: null,
          query_text: manualQuery,
          match_threshold: 0.0,
          match_count: 10,
          p_user_id: session?.user?.id ?? null,
        });
        if (error) throw error;
        results = (data as unknown as MacroMatch[]) || [];
      } catch (rpcError) {
        console.warn("RPC failed, falling back to API:", rpcError);
        usedFallback = true;
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(manualQuery)}`,
        );
        if (res.ok) {
          results = (await res.json()) as MacroMatch[];
        }
      }

      setSearchResults(results);
    } catch (err) {
      console.error(err);
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
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

  const handleDeleteLog = async (id: string) => {
      setDeletingLogId(id);
      const previousLogs = dailyLogs;
      setDailyLogs(prev => prev.filter(log => log.id !== id));
      try {
          await deleteFoodLog(id);
          toast.success("Log deleted");
      } catch {
          setDailyLogs(previousLogs);
          toast.error("Failed to delete");
      } finally {
          setDeletingLogId(null);
      }
  };

  const handleEditField = (field: keyof FoodLogRecord, value: string | number) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBeginEdit = (log: FoodLogRecord) => {
    setEditingLogId(log.id);
    setEditForm(log);
  };

  const handleCancelEdit = () => {
    setEditingLogId(null);
    setEditForm({});
  };

  const handleSaveEdits = async (id: string) => {
    const originalLog = dailyLogs.find((l) => l.id === id);
    if (!originalLog) return;

    const optimisticLog = { ...originalLog, ...editForm };
    setDailyLogs((prev) => prev.map((l) => (l.id === id ? optimisticLog : l)));
    setEditingLogId(null);

    try {
      await updateFoodLog(id, editForm);
      toast.success("Log updated");
    } catch (err) {
      setDailyLogs((prev) => prev.map((l) => (l.id === id ? originalLog : l)));
      toast.error("Update failed");
    }
  };

  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleLogWater = async () => {
    if (waterAmount <= 0) return;
    setIsLoggingWater(true);
    const optimisticId = `temp_${Date.now()}`;
    const newLog: WaterLog = {
      id: optimisticId,
      amount_ml: waterAmount,
      logged_at: new Date().toISOString(),
      isOptimistic: true,
    };
    setWaterLogs((prev) => [newLog, ...prev]);

    try {
      const savedLog = await logWater(waterAmount, new Date().toISOString());
      if (savedLog) {
        setWaterLogs((prev) =>
          prev.map((l) =>
            l.id === optimisticId ? { ...savedLog, isOptimistic: false } : l,
          ),
        );
        toast.success("Water logged");
      }
    } catch {
      setWaterLogs((prev) => prev.filter((l) => l.id !== optimisticId));
      toast.error("Failed to log water");
    } finally {
      setIsLoggingWater(false);
    }
  };

  const handleDeleteWater = async (id: string) => {
    const prevLogs = waterLogs;
    setWaterLogs((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteWaterLog(id);
    } catch {
      setWaterLogs(prevLogs);
      toast.error("Failed to delete water log");
    }
  };

  return (
    <>
      <main className="mx-auto max-w-md pb-24">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Hello, {profile?.first_name || "User"}</h1>
            <p className="text-sm text-white/60">Let's hit your goals today.</p>
          </div>
          <div className="h-10 w-10 overflow-hidden rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
             {/* Profile Image Placeholder */}
             <div className="flex h-full w-full items-center justify-center text-emerald-400 font-bold">
                 {profile?.first_name?.[0] || "U"}
             </div>
          </div>
        </header>
        {isTemplateManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
             <div className="w-full max-w-md rounded-2xl bg-[#1a1a1a] p-6 ring-1 ring-white/10">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Saved Meals</h2>
                    <button onClick={() => setIsTemplateManagerOpen(false)} className="text-white/50 hover:text-white">✕</button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-3">
                    {templateList.length === 0 ? (
                        <p className="text-center text-white/40 py-8">No saved meals yet.</p>
                    ) : (
                        templateList.map(t => (
                            <div key={t.id} className="flex items-center justify-between rounded-xl bg-white/5 p-4">
                                <div>
                                    <p className="font-medium text-white">{t.name}</p>
                                    <p className="text-xs text-white/50">{t.items.length} items</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleApplyTemplate(t.id)} disabled={isApplyingTemplate} className="btn bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm py-1">Load</button>
                                    <button onClick={() => handleDeleteTemplate(t.id)} className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm py-1">Delete</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
             </div>
          </div>
        )}
        <ManualSearchModal
          isOpen={manualOpenIndex !== null || (isHomeRoute && viewParam === "manual")}
          onClose={() => {
              setManualOpenIndex(null);
              setSearchResults([]);
              updateScannerView(null);
          }}
          query={manualQuery}
          onChangeQuery={setManualQuery}
          onSearch={runManualSearch}
          isSearching={isSearching}
          results={searchResults}
          onSelect={applyManualResult}
          recentFoods={recentFoods}
          isLoadingRecentFoods={isLoadingRecentFoods}
        />
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
                    templateList={templateList}
                    selectedTemplateId={selectedTemplateId}
                    templateScale={templateScale}
                    onTemplateChange={setSelectedTemplateId}
                    onTemplateScaleChange={setTemplateScale}
                    onApplyTemplate={handleApplyTemplate}
                    onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
                    isApplyingTemplate={isApplyingTemplate}
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Draft entries</h2>
                    <div className="flex gap-2">
                         <button className="text-xs text-white/50 hover:text-white" onClick={() => setDraft([])}>Clear All</button>
                    </div>
                  </div>
                  {draftWithDefaults.map((item, index) => (
                    <div key={item.id} className="relative">
                      <DraftReview
                        draftItem={item}
                        onSave={(overrides) => logFoodItem(item, index, overrides)}
                        onDiscard={() => {
                          setDraft((prev) => {
                            const next = prev.filter((_, i) => i !== index);
                            if (next.length === 0) updateScannerView(null);
                            return next;
                          });
                        }}
                        isSaving={loggingIndex === index}
                        onUpdateWeight={(w) => {
                          setDraft((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], weight: w };
                            return next;
                          });
                        }}
                        onUpdateMacro={(field, val) => {
                            // Handled locally in DraftReview or passed up if we want draft state to hold it
                            // For now, logging happens with overrides
                        }}
                        onChangeFood={() => {
                          setManualOpenIndex(index);
                          setManualQuery(item.food_name || "");
                        }}
                      />
                    </div>
                  ))}
                   <div className="mt-4 border-t border-white/10 pt-4">
                      <button 
                        onClick={confirmAllDrafts} 
                        disabled={isConfirmingAll}
                        className="btn w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3"
                      >
                          {isConfirmingAll ? "Saving All..." : `Confirm All (${draft.length})`}
                      </button>
                      <button
                        className="mt-2 w-full text-sm text-white/50 hover:text-white"
                        onClick={() => {
                            setManualOpenIndex(-1);
                            setManualQuery("");
                        }}
                      >
                        + Add another item manually
                      </button>
                   </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-4">
                 <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">Calories</div>
                    <div className="flex items-end gap-1">
                        <span className={`text-3xl font-bold ${dailyTotals.calories > calorieTarget ? "text-red-400" : "text-white"}`}>
                            {Math.round(dailyTotals.calories)}
                        </span>
                        <span className="mb-1 text-sm text-white/50">/ {calorieTarget}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${dailyTotals.calories > calorieTarget ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min((dailyTotals.calories / calorieTarget) * 100, 100)}%` }} />
                    </div>
                 </div>
                 <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">Macros</div>
                    <div className="space-y-2">
                        {/* Protein */}
                        <div>
                            <div className="flex justify-between text-xs text-white/70">
                                <span>Protein</span>
                                <span>{Math.round(dailyTotals.protein)} / {macroTargets.protein}g</span>
                            </div>
                            <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min((dailyTotals.protein / macroTargets.protein) * 100, 100)}%` }} />
                            </div>
                        </div>
                         {/* Carbs */}
                         <div>
                            <div className="flex justify-between text-xs text-white/70">
                                <span>Carbs</span>
                                <span>{Math.round(dailyTotals.carbs)} / {macroTargets.carbs}g</span>
                            </div>
                            <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min((dailyTotals.carbs / macroTargets.carbs) * 100, 100)}%` }} />
                            </div>
                        </div>
                         {/* Fat */}
                         <div>
                            <div className="flex justify-between text-xs text-white/70">
                                <span>Fat</span>
                                <span>{Math.round(dailyTotals.fat)} / {macroTargets.fat}g</span>
                            </div>
                            <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min((dailyTotals.fat / macroTargets.fat) * 100, 100)}%` }} />
                            </div>
                        </div>
                    </div>
                 </div>
              </section>

             <section className="rounded-2xl border border-white/10 bg-[#111] p-4">
               <div className="mb-4 flex items-center justify-between">
                 <div>
                    <h3 className="text-lg font-semibold text-white">Water Tracker</h3>
                    <p className="text-xs text-white/50">Stay hydrated.</p>
                 </div>
                 <div className="text-right">
                    <span className="text-2xl font-bold text-blue-400">
                        {(waterLogs.reduce((sum, log) => sum + log.amount_ml, 0) / 1000).toFixed(1)}L
                    </span>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                    <button 
                        onClick={() => {
                            if(waterAmount > 50) setWaterAmount(prev => prev - 50);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10"
                    >-</button>
                    <div className="flex-1 text-center">
                        <span className="text-xl font-medium text-white">{waterAmount}ml</span>
                    </div>
                    <button 
                        onClick={() => setWaterAmount(prev => prev + 50)}
                         className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10"
                    >+</button>
                    <button 
                        onClick={handleLogWater}
                        disabled={isLoggingWater}
                        className="ml-2 rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/30"
                    >
                        {isLoggingWater ? "..." : "Add"}
                    </button>
               </div>
               {waterLogs.length > 0 && (
                 <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                    {waterLogs.slice(0, 5).map(log => (
                        <div key={log.id} className={`flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs text-white/70 ${log.isOptimistic ? "opacity-50" : ""}`}>
                            <span>{log.amount_ml}ml</span>
                            <button onClick={() => handleDeleteWater(log.id)} className="text-white/30 hover:text-white">×</button>
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
                <button className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400" onClick={() => updateScannerView("scan")} aria-label="Add Log">
                  <span className="text-2xl">+</span>
                </button>
                <button className="rounded-full bg-white/10 p-3 text-sm font-medium text-white backdrop-blur-md" onClick={() => { setManualOpenIndex(-1); setManualQuery(""); updateScannerView("manual"); }}>
                  Manual Add
                </button>
             </div>
          </div>
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
    </>
  );
}