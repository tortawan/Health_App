"use client";

import React, { useEffect, useRef } from "react";
import { adjustedMacros } from "@/lib/nutrition";
import { formatNumber } from "@/lib/format";
import { DraftLog, MacroMatch } from "@/types/food";

type Props = {
  draft: DraftLog[];
  confidenceLabel: string;
  editingWeightIndex: number | null;
  loggingIndex: number | null;
  isConfirmingAll: boolean;
  isImageUploading: boolean;
  templateName: string;
  isSavingTemplate: boolean;
  onTemplateNameChange: (value: string) => void;
  onSaveTemplate: () => void;
  onConfirmAll: () => void;
  onToggleWeightEdit: (index: number) => void;
  onUpdateWeight: (index: number, weight: number) => void;
  onConfirm: (index: number) => void;
  onManualSearch: (index: number) => void;
  onApplyMatch: (index: number, match: MacroMatch) => void;
};

const QUICK_MULTIPLIERS = [
  { label: "0.5x", factor: 0.5 },
  { label: "1.5x", factor: 1.5 },
  { label: "2.0x", factor: 2 },
];

const QUICK_PRESETS = [
  { label: "Small (100g)", value: 100 },
  { label: "Medium (200g)", value: 200 },
];

export function DraftReview({
  draft,
  confidenceLabel,
  editingWeightIndex,
  loggingIndex,
  isConfirmingAll,
  isImageUploading,
  templateName,
  isSavingTemplate,
  onTemplateNameChange,
  onSaveTemplate,
  onConfirmAll,
  onToggleWeightEdit,
  onUpdateWeight,
  onConfirm,
  onManualSearch,
  onApplyMatch,
}: Props) {
  const autoManualTriggered = useRef<Set<string>>(new Set());
  // Track the initial state of the draft to compare against for RLHF logging
  const initialDraftRef = useRef<DraftLog[] | null>(null);

  useEffect(() => {
    // Only set initial draft if it's currently empty and we have incoming data
    if (draft.length > 0 && !initialDraftRef.current) {
      initialDraftRef.current = JSON.parse(JSON.stringify(draft));
    }
    // If draft is cleared (e.g. after confirming), reset the ref
    if (draft.length === 0) {
      initialDraftRef.current = null;
    }

    draft.forEach((item, index) => {
    // ✅ CHANGED: Check for singular 'match' to prevent aggressive auto-opening
    if (item.match) return; 

    const key = `${item.food_name}-${item.search_term}-${index}`;
    if (autoManualTriggered.current.has(key)) return;
    
    autoManualTriggered.current.add(key);
    onManualSearch(index);
  });
}, [draft, onManualSearch]);

  const handleLogCorrection = async (index: number) => {
    const final = draft[index];
    const original = initialDraftRef.current ? initialDraftRef.current[index] : null;

    if (!original) return;

    // Detect changes
    const weightChanged = original.weight !== final.weight;
    const matchChanged = original.match?.description !== final.match?.description;

    if (weightChanged || matchChanged) {
      const canSend =
        typeof navigator === "undefined" ? true : navigator.onLine !== false;

      if (!canSend) return;

      try {
        await fetch("/api/log-correction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original,
            final,
            correctedField: matchChanged ? "match" : "weight",
          }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (message.includes("network")) {
          return;
        }
        console.error("Failed to log correction", err);
      }
    }
  };

  const handleConfirm = (index: number) => {
    handleLogCorrection(index);
    onConfirm(index);
  };

  const handleConfirmAll = () => {
    // Log all items that changed
    draft.forEach((_, index) => handleLogCorrection(index));
    onConfirmAll();
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">Verification</p>
          <h2 className="text-xl font-semibold text-white">Draft entries</h2>
          <p className="text-sm text-white/60">
            We never auto-save. Confirm or adjust the AI guess before logging.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!draft.length || isConfirmingAll || isImageUploading}
            onClick={handleConfirmAll}
            type="button"
          >
            {isConfirmingAll ? "Saving all..." : "Confirm all"}
          </button>
          <span className="pill bg-emerald-500/20 text-emerald-100">{confidenceLabel}</span>
        </div>
      </div>

      {draft.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-white">Save as meal template</p>
            <span className="text-xs text-white/60">Store this draft for faster future logging.</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              placeholder="e.g., Chicken and Rice"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
            />
            <button className="btn" disabled={isSavingTemplate} onClick={onSaveTemplate} type="button">
              {isSavingTemplate ? "Saving..." : "Save as meal"}
            </button>
          </div>
        </div>
      )}

      {!draft.length ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
          No draft yet. Upload an image to generate a structured suggestion.
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map((item, index) => {
            const adjusted = adjustedMacros(item.match, item.weight);
            const shouldShowPicker =
              (item.match?.similarity ?? 0) >= 0.7 &&
              (item.match?.similarity ?? 0) < 0.85 &&
              item.matches?.length;
            const candidates = item.matches ?? [];

            return (
              <div
                className="rounded-xl border border-white/10 bg-slate-900/60 p-4"
                key={`${item.food_name}-${index}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-white">{item.food_name}</h3>
                    <button
                      className="pill bg-white/10 text-white/70 hover:bg-white/20"
                      onClick={() => onToggleWeightEdit(index)}
                      type="button"
                    >
                      {item.quantity_estimate} ({item.weight}g)
                    </button>
                  </div>
                  <p className="text-sm text-white/60">Search term: {item.search_term}</p>
                  {editingWeightIndex === index && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
                      <label className="text-white/60" htmlFor={`weight-${index}`}>
                        Adjust weight (g):
                      </label>
                      <input
                        aria-label={`Adjust weight for ${item.food_name}`}
                        className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white focus:border-emerald-400 focus:outline-none"
                        id={`weight-${index}`}
                        min={1}
                        type="number"
                        value={item.weight}
                        onChange={(e) => onUpdateWeight(index, Number(e.target.value))}
                      />
                      <div className="flex flex-wrap gap-2">
                        {QUICK_MULTIPLIERS.map((preset) => (
                          <button
                            aria-label={`Set weight to ${preset.label} of ${item.food_name}`}
                            className="pill bg-white/10 text-white hover:bg-white/20"
                            key={preset.label}
                            onClick={() =>
                              onUpdateWeight(index, Math.max(1, Math.round(item.weight * preset.factor)))
                            }
                            type="button"
                          >
                            {preset.label}
                          </button>
                        ))}
                        {QUICK_PRESETS.map((preset) => (
                          <button
                            aria-label={`Set weight to ${preset.value} grams for ${item.food_name}`}
                            className="pill bg-white/10 text-white hover:bg-white/20"
                            key={preset.label}
                            onClick={() => onUpdateWeight(index, preset.value)}
                            type="button"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <button
                        aria-label={`Close weight adjustment for ${item.food_name}`}
                        className="btn bg-white/10 text-white hover:bg-white/20"
                        type="button"
                        onClick={() => onToggleWeightEdit(index)}
                      >
                        Done
                      </button>
                    </div>
                  )}
                  {item.match ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/80">
                      <div className="rounded-lg bg-white/5 p-2">
                        <p className="text-xs uppercase text-white/50">
                          Match ({formatNumber(item.match.similarity, 2)} similarity)
                        </p>
                        <p>{item.match.description}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 p-2">
                        <p className="text-xs uppercase text-white/50">Macros / 100g</p>
                        <p className="flex flex-wrap gap-2">
                          <span>Kcal {formatNumber(item.match.kcal_100g)}</span>
                          <span>Protein {formatNumber(item.match.protein_100g)}g</span>
                          <span>Carbs {formatNumber(item.match.carbs_100g)}g</span>
                          <span>Fat {formatNumber(item.match.fat_100g)}g</span>
                        </p>
                      </div>
                      <div className="col-span-2 rounded-lg bg-emerald-500/10 p-2">
                        <p className="text-xs uppercase text-emerald-100/70">
                          Adjusted macros ({item.weight}g)
                        </p>
                        {adjusted ? (
                          <p className="flex flex-wrap gap-2 text-emerald-50">
                            <span>Kcal {formatNumber(adjusted.calories)}</span>
                            <span>Protein {formatNumber(adjusted.protein)}g</span>
                            <span>Carbs {formatNumber(adjusted.carbs)}g</span>
                            <span>Fat {formatNumber(adjusted.fat)}g</span>
                          </p>
                        ) : (
                          <p className="text-emerald-100/80">Add a manual match to calculate macros.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-100/80">
                      No confident match found. Try manual search to select the right food.
                    </p>
                  )}
                </div>
                {shouldShowPicker ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/60">Other possible matches</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {candidates.map((candidate, idx) => (
                        <button
                          className={`min-w-[220px] rounded-lg border px-3 py-2 text-left text-sm ${
                            candidate.description === item.match?.description
                              ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-50"
                              : "border-white/10 bg-slate-900/40 text-white"
                          }`}
                          key={`${candidate.description}-${idx}`}
                          onClick={() => onApplyMatch(index, candidate)}
                          type="button"
                        >
                          <p className="font-medium">{candidate.description}</p>
                          <p className="text-xs text-white/60">
                            Similarity {formatNumber(candidate.similarity, 2)}
                          </p>
                          <p className="text-xs text-white/60">
                            Kcal {formatNumber(candidate.kcal_100g)} • Protein{" "}
                            {formatNumber(candidate.protein_100g)}g
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <button
                    className="btn disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!item.match || loggingIndex === index || isImageUploading || isConfirmingAll}
                    onClick={() => handleConfirm(index)}
                    type="button"
                  >
                    {loggingIndex === index
                      ? "Saving..."
                      : isImageUploading
                        ? "Uploading photo..."
                        : "Confirm"}
                  </button>
                  <button
                    aria-controls={`weight-${index}`}
                    aria-expanded={editingWeightIndex === index}
                    className="btn bg-white/10 text-white hover:bg-white/20"
                    onClick={() => onToggleWeightEdit(index)}
                    type="button"
                  >
                    Adjust weight
                  </button>
                  <button
                    className="btn bg-white/10 text-white hover:bg-white/20"
                    onClick={() => onManualSearch(index)}
                    type="button"
                  >
                    Manual search
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
