"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";

// --- Actions ---
import {
  getRecentFoods,
  deleteFoodLog,
  updateFoodLog,
} from "./actions/food";

// --- Hooks ---
import { useProfileForm } from "./hooks/useProfileForm";
import { useWaterTracking } from "@/hooks/tracking/useWaterTracking";
import { useTemplateManagement } from "@/hooks/features/useTemplateManagement";
import { useDateNavigation } from "@/hooks/features/useDateNavigation";
import { useScannerOrchestration } from "@/hooks/scanner/useScannerOrchestration";
import { useManualFoodSearch } from "@/hooks/features/useManualFoodSearch";
import { generateDraftId } from "@/lib/uuid";

// --- Components ---
import { CameraCapture } from "../components/scanner/CameraCapture";
import { DailyLogList } from "../components/dashboard/DailyLogList";
import { DraftReview } from "../components/logging/DraftReview";
import { ManualSearchModal } from "../components/logging/ManualSearchModal";
import { CameraErrorBoundary } from "../components/CameraErrorBoundary";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { TemplateManagerModal } from "@/components/templates/TemplateManagerModal";
import { WaterTracker } from "@/components/tracking/WaterTracker";
import { FlagLogModal } from "@/components/reporting/FlagLogModal";
import { FABGroup } from "@/components/layout/FABGroup";

// --- Types ---
import {
  DraftLog,
  FoodLogRecord,
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

export default function HomeClient({
  initialLogs,
  initialRecentFoods,
  initialPortionMemories,
  initialProfile,
  initialTemplates = [],
  initialWaterLogs,
  initialSelectedDate,
}: Props) {
  // 1. Navigation & Refs
  const { selectedDate, handleShiftDate, setSelectedDate } = useDateNavigation(initialSelectedDate);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const optimisticScanIdRef = useRef<string | null>(null);

  // 2. Data State
  const [dailyLogs, setDailyLogs] = useState<FoodLogRecord[]>(initialLogs);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>(initialRecentFoods);
  const [portionMemories, setPortionMemories] = useState<PortionMemoryRow[]>(initialPortionMemories ?? []);
  const [isLoadingRecentFoods, setIsLoadingRecentFoods] = useState(false);

  // Sync with server if initialLogs updates (e.g. server revalidation)
  useEffect(() => {
    setDailyLogs(initialLogs);
  }, [initialLogs]);

  // 3. Feature Hooks
  const waterTracking = useWaterTracking(initialWaterLogs ?? [], selectedDate);
  const templates = useTemplateManagement(initialTemplates);
  useProfileForm(initialProfile);

  // 4. Helpers (Portion Memory & Corrections)
  const bumpPortionMemory = useCallback((foodName: string, weight: number) => {
    setPortionMemories((prev) => {
      const existing = prev.findIndex(
        (p) => p.food_name.toLowerCase() === foodName.toLowerCase()
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
  }, []);

  const logWeightCorrection = useCallback(async (original: DraftLog) => {
    if (!original.ai_suggested_weight || !original.weight) return;
    if (Math.abs(original.weight - original.ai_suggested_weight) <= 10) return;
    
    // We treat the "original" draft item as having the AI weight for the 'original' field
    // and the user's manual weight as the 'final'
    try {
      await fetch("/api/log-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original: { ...original, weight: original.ai_suggested_weight },
          final: original,
          correctedField: "weight",
        }),
      });
    } catch (error) {
      console.warn("[Corrections] Non-blocking log failed", error);
    }
  }, []);

  // 5. Optimistic Scan Handlers
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

  const handleOptimisticScanComplete = useCallback(() => {
    if (optimisticScanIdRef.current) {
      setDailyLogs((prev) => prev.filter((log) => log.id !== optimisticScanIdRef.current));
      optimisticScanIdRef.current = null;
    }
  }, []);

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

  // 6. Scanner Orchestration
  const scanner = useScannerOrchestration({
    selectedDate,
    onLogAdded: (newLog) => setDailyLogs((prev) => [newLog, ...prev]),
    onRefreshRecent: refreshRecentFoods,
    onAnalysisStart: handleOptimisticScanStart,
    onAnalysisComplete: handleOptimisticScanComplete,
    onAnalysisError: handleOptimisticScanComplete, // Cleanup on error too
    onLogConfirmed: (draftItem) => {
      bumpPortionMemory(draftItem.food_name, draftItem.weight);
      void logWeightCorrection(draftItem);
    }
  });

  // 7. Manual Search Orchestration
  const manualSearch = useManualFoodSearch({
    portionMemories, 
    onSelect: (draftItem, replaceIndex) => {
      if (replaceIndex !== undefined) {
         // Surgical update: Preserve ID and existing metadata
         scanner.setDraft((prev) => {
           const next = [...prev];
           const originalItem = next[replaceIndex];
           if (!originalItem) return prev; // Safety check
           
           next[replaceIndex] = {
             ...originalItem,
             food_name: draftItem.food_name,
             match: draftItem.match,
             weight: draftItem.weight, // Update weight from portion memory/default
             search_term: draftItem.search_term,
             // Implicitly preserves: id, macro_overrides, ai_suggested_weight
           };
           return next;
         });
      } else {
         // Add new draft item
         scanner.setDraft((prev) => [...prev, draftItem]);
         scanner.updateScannerView("scan");
      }
    },
  });

  // 8. Calculations
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

  // 9. Local UI State (Editing/Flagging)
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodLogRecord>>({});
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [deletingId, setDeletingLogId] = useState<string | null>(null);

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
     } catch (err: any) {
       console.error(err);
       setDailyLogs(previousLogs);
       toast.error(err.message || "Unable to update log");
     }
  };

  const handleDeleteLog = async (id: string) => {
      const previousLogs = dailyLogs;
      setDeletingLogId(id);
      setDailyLogs(prev => prev.filter(l => l.id !== id));
      try {
        await deleteFoodLog(id);
        toast.success("Entry deleted");
      } catch (err: any) {
        console.error(err);
        setDailyLogs(previousLogs);
        toast.error(err.message || "Unable to delete entry");
      } finally {
        setDeletingLogId(null);
      }
  };

  const handleSaveTemplate = async () => {
    const items = scanner.draft
      .map((item) => ({
        usda_id: item.match?.usda_id,
        grams: item.weight,
      }))
      .filter((item): item is { usda_id: number; grams: number } =>
        Number.isFinite(item.usda_id),
      );

    if (items.length !== scanner.draft.length) {
      toast.error("All items must have a USDA match to save a template.");
      return;
    }
    await templates.saveTemplate(templates.templateName, items);
  };

  const handleApplyTemplate = async () => {
    if (!templates.selectedTemplateId) return;
    try {
      const inserted = await templates.applyTemplate(
        templates.selectedTemplateId,
        templates.templateScale,
      );
      if (Array.isArray(inserted)) {
        setDailyLogs((prev) => [...inserted, ...prev]);
        toast.success("Template applied");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const shouldShowScanner = scanner.showScanner || scanner.draft.length > 0;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-md px-4 pt-6 space-y-8">
        {/* Modals */}
        <TemplateManagerModal {...templates} dailyLogs={dailyLogs} />
        <FlagLogModal 
          log={flaggingLog} 
          isOpen={!!flaggingLog} 
          onClose={() => setFlaggingLog(null)} 
        />
        <ManualSearchModal 
          isLoadingRecentFoods={isLoadingRecentFoods}
          isSearching={manualSearch.isSearching}
          onChangeQuery={manualSearch.setManualQuery}
          onClose={() => manualSearch.setManualOpenIndex(null)}
          onSearch={manualSearch.runManualSearch}
          onSelect={manualSearch.applyManualResult}
          openIndex={manualSearch.manualOpenIndex}
          query={manualSearch.manualQuery}
          recentFoods={recentFoods}
          results={manualSearch.searchResults}
        />

        <ErrorBoundary fallback={<div>Something went wrong.</div>}>
          {shouldShowScanner ? (
            <div className="relative z-10 rounded-2xl bg-[#111] p-4 shadow-2xl ring-1 ring-white/10">
              {/* Analysis Loading State */}
              {scanner.draft.length === 0 && scanner.isAnalyzing && (
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
                  <p className="text-base font-semibold">Analyzing your food...</p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400" />
                  </div>
                </div>
              )}

              {/* Camera or Draft View */}
              {scanner.draft.length === 0 ? (
                <CameraErrorBoundary
                  onManualUpload={scanner.handleImageUpload}
                  onRetry={() => scanner.updateScannerView("scan")}
                >
                  <CameraCapture
                    captureMode="photo"
                    isUploading={scanner.isAnalyzing || scanner.isImageUploading}
                    isImageUploading={scanner.isImageUploading}
                    filePreview={scanner.imagePublicUrl}
                    templateList={templates.templateList}
                    selectedTemplateId={templates.selectedTemplateId}
                    templateScale={templates.templateScale}
                    onTemplateChange={templates.setSelectedTemplateId}
                    onTemplateScaleChange={templates.setTemplateScale}
                    onApplyTemplate={handleApplyTemplate}
                    onOpenTemplateManager={() => templates.setIsTemplateManagerOpen(true)}
                    isApplyingTemplate={templates.isApplyingTemplate}
                    onFileChange={(file) => file && scanner.handleImageUpload(file)}
                    analysisMessage={scanner.noFoodDetected ? null : scanner.analysisMessage}
                    queuedCount={scanner.queuedCount}
                    queueNotice={scanner.queueNotice}
                    fileInputRef={photoInputRef} 
                  />
                  {/* No Food Detected Fallback */}
                  {scanner.noFoodDetected && !scanner.isAnalyzing && !scanner.isImageUploading && (
                    <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <p className="text-base font-semibold">We couldn&apos;t detect any food.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                         <button className="btn" onClick={() => scanner.resetAnalysis()}>Try again</button>
                         <button className="btn bg-white/10" onClick={() => manualSearch.setManualOpenIndex(-1)}>Search manually</button>
                      </div>
                    </div>
                  )}
                </CameraErrorBoundary>
              ) : (
                <DraftReview
                  confidenceLabel="High confidence"
                  draft={scanner.draft}
                  imageSrc={scanner.imagePublicUrl}
                  usedFallback={scanner.usedFallback}
                  editingWeightIndex={scanner.editingWeightIndex}
                  isConfirmingAll={false}
                  isImageUploading={scanner.isImageUploading}
                  isSavingTemplate={templates.isSavingTemplate}
                  loggingIndex={scanner.loggingIndex}
                  // Draft Actions via Scanner Hook
                  onApplyMatch={(idx, m) => {
                    const d = [...scanner.draft]; d[idx].match = m; scanner.setDraft(d);
                  }}
                  onConfirm={scanner.handleConfirm}
                  onConfirmAll={() => toast("Batch confirm not implemented yet")}
                  onManualSearch={(idx) => {
                    manualSearch.setManualOpenIndex(idx);
                    manualSearch.setManualQuery(scanner.draft[idx].search_term || scanner.draft[idx].food_name);
                  }}
                  onSaveTemplate={handleSaveTemplate}
                  onTemplateNameChange={templates.setTemplateName}
                  onToggleWeightEdit={(idx) => scanner.setEditingWeightIndex(scanner.editingWeightIndex === idx ? null : idx)}
                  onUpdateWeight={(idx, w) => { 
                    const d = [...scanner.draft]; d[idx].weight = w; scanner.setDraft(d); 
                  }}
                  onUpdateMacro={scanner.handleUpdateMacro}
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
               isCopyingDay={false}
               onCopyYesterday={() => toast("Copy not implemented in demo")}
               
               // Edit / Delete / Flag
               editingLogId={editingLogId}
               editForm={editForm}
               onEditField={handleEditField}
               onBeginEdit={(log) => { setEditingLogId(log.id); setEditForm(log); }}
               onSaveEdits={handleSaveEdits}
               onCancelEdit={() => { setEditingLogId(null); setEditForm({}); }}
               onFlagLog={setFlaggingLog}
               deletingId={deletingId}
               onDeleteLog={handleDeleteLog}
             />
             <FABGroup 
               onScanClick={() => scanner.updateScannerView("scan")}
               onManualClick={() => manualSearch.setManualOpenIndex(-1)}
             />
          </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}