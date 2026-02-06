import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useScanner } from "@/hooks/scanner/useScanner"; 
import { FoodLogRecord, DraftLog } from "@/types/food";

type Props = {
  selectedDate: string;
  onLogAdded: (log: FoodLogRecord) => void;
  onRefreshRecent: () => void;
  onAnalysisStart?: () => void;
  onAnalysisComplete?: (data: any) => void;
  onAnalysisError?: (msg: string) => void;
  onLogConfirmed?: (draftItem: DraftLog) => void;
};

export function useScannerOrchestration({
  selectedDate,
  onLogAdded,
  onRefreshRecent,
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError,
  onLogConfirmed,
}: Props) {
  const scanner = useScanner({
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
  });

  const { draft, setDraft, imagePublicUrl, setError, updateScannerView } = scanner;
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(null);

  const handleUpdateMacro = useCallback(
    (index: number, field: "protein" | "carbs" | "fat", value: number) => {
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
    [setDraft]
  );

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

      const macroOverrides = item.macro_overrides ?? {};
      const payload = {
        foodName: item.food_name,
        weight: item.weight,
        match: item.match,
        imageUrl: imagePublicUrl,
        consumedAt: targetDate.toISOString(),
        ...macroOverrides,
      };

      const response = await fetch("/api/log-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to log food");

      const newEntry = Array.isArray(result.data) ? result.data[0] : result.data;
      if (newEntry) {
        onLogAdded(newEntry as FoodLogRecord);
        if (onLogConfirmed) onLogConfirmed(item);

        setDraft((prev) => {
          const next = prev.filter((_, i) => i !== index);
          if (next.length === 0) updateScannerView(null);
          return next;
        });
        toast.success("Food log saved");
      }
      onRefreshRecent();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoggingIndex(null);
    }
  };

  return {
    ...scanner,
    loggingIndex,
    editingWeightIndex,
    setEditingWeightIndex,
    handleUpdateMacro,
    handleConfirm,
  };
}