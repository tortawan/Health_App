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
  { label: "Large (300g)", value: 300 },
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
  onConfirm: handleConfirm,
  onManualSearch,
  // onApplyMatch, // Removed to fix unused var lint error
}: Props) {
  // We'll track which items we've already auto-opened manual search for
  const autoManualTriggered = useRef<Set<string>>(new Set());
  const initialDraftRef = useRef<DraftLog[] | null>(null);

  // Capture initial draft state for later comparisons (e.g. log correction)
  useEffect(() => {
    if (draft.length > 0 && !initialDraftRef.current) {
      initialDraftRef.current = JSON.parse(JSON.stringify(draft));
    }
    // Reset if draft cleared
    if (draft.length === 0) {
      initialDraftRef.current = null;
    }

    // ✅ CRITICAL FIX: Stop auto-search if user is editing weight
    // This prevents the "Manual Search" modal from popping up over the "Done" button.
    if (editingWeightIndex !== null) return;

    // Check each item. If no match yet, and not already triggered, open manual search
    draft.forEach((item, index) => {
      // ✅ STANDARD FIX: Don't auto-search if we already have a match
      if (item.match) return;

      const key = `${item.food_name}-${item.search_term}-${index}`;
      if (autoManualTriggered.current.has(key)) return;

      // Mark as triggered so we don't spam it
      autoManualTriggered.current.add(key);
      onManualSearch(index);
    });
  }, [draft, onManualSearch, editingWeightIndex]);

  // Helper to see if user changed weight from original
  const getWeightChange = (index: number, currentWeight: number) => {
    if (!initialDraftRef.current) return null;
    const original = initialDraftRef.current[index];
    if (!original) return null;
    if (original.weight === currentWeight) return null;
    return { from: original.weight, to: currentWeight };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Draft entries</h2>
          <p className="text-sm text-emerald-400">{confidenceLabel}</p>
        </div>
        {draft.length > 1 && (
          <button
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
            disabled={isConfirmingAll || isImageUploading}
            onClick={onConfirmAll}
            type="button"
          >
            {isConfirmingAll ? "Saving all..." : "Confirm all"}
          </button>
        )}
      </div>

      {/* Save as Template UI (optional) */}
      {draft.length > 1 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-500 focus:outline-none"
              placeholder="Name this meal (e.g. 'Post-workout Breakfast')"
              type="text"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
            />
            <button
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
              disabled={!templateName.trim() || isSavingTemplate}
              onClick={onSaveTemplate}
              type="button"
            >
              {isSavingTemplate ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>
      )}

      {draft.length === 0 ? (
        <p className="text-white/60">No items in draft.</p>
      ) : (
        <div className="space-y-4">
          {draft.map((item, index) => {
            const macros = item.match
              ? adjustedMacros(item.match, item.weight)
              : { calories: 0, protein: 0, carbs: 0, fat: 0 };

            const weightChange = getWeightChange(index, item.weight);

            return (
              <div
                key={index}
                className={`relative rounded-xl border p-4 transition-colors ${
                  !item.match
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {item.food_name}
                    </h3>
                    {!item.match && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                        <span className="block h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Needs match
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {Math.round(macros.calories)}
                      <span className="text-sm font-normal text-white/60">
                        kcal
                      </span>
                    </div>
                    {/* Weight Display */}
                    <div className="flex flex-col items-end">
                      <div className="text-sm text-white/60">
                        {item.weight}g
                      </div>
                      {weightChange && (
                        <span className="text-xs text-amber-400">
                          (was {weightChange.from}g)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Weight Editor */}
                {editingWeightIndex === index && (
                  <div className="mb-4 rounded-lg bg-black/40 p-3">
                    <label className="block text-xs text-white/60 mb-1">
                      Adjust weight (grams)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        className="w-24 rounded border border-white/20 bg-transparent px-2 py-1 text-white focus:border-emerald-500 focus:outline-none"
                        type="number"
                        value={item.weight ?? ""}
                        onChange={(e) =>
                          onUpdateWeight(index, parseInt(e.target.value) || 0)
                        }
                      />
                      <button
                        className="rounded bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400 hover:bg-emerald-500/30"
                        onClick={() => onToggleWeightEdit(index)}
                        type="button"
                      >
                        Done
                      </button>
                    </div>
                    {/* Quick Multipliers */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {QUICK_MULTIPLIERS.map((m) => (
                        <button
                          key={m.label}
                          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
                          onClick={() =>
                            onUpdateWeight(
                              index,
                              Math.round(item.weight * m.factor),
                            )
                          }
                          type="button"
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {QUICK_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
                          onClick={() => onUpdateWeight(index, p.value)}
                          type="button"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Macro match details */}
                {item.match ? (
                  <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                    <div>
                      <div className="text-xs text-white/60">Protein</div>
                      <div className="font-medium text-white">
                        {formatNumber(macros.protein)}g
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Carbs</div>
                      <div className="font-medium text-white">
                        {formatNumber(macros.carbs)}g
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Fat</div>
                      <div className="font-medium text-white">
                        {formatNumber(macros.fat)}g
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <button
                    className="btn disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !item.match ||
                      loggingIndex === index ||
                      isImageUploading ||
                      isConfirmingAll
                    }
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