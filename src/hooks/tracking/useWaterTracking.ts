// src/hooks/tracking/useWaterTracking.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { logWater, updateWaterLog, deleteWaterLog } from "@/app/actions/tracking";
import type { WaterLog, UseWaterTrackingReturn } from "@/types/water";

export function useWaterTracking(
  initialLogs: WaterLog[],
  selectedDate: string
): UseWaterTrackingReturn {
  const router = useRouter();
  const [logs, setLogs] = useState<WaterLog[]>(initialLogs);
  const [waterAmount, setWaterAmount] = useState(250);
  const [waterSaving, setWaterSaving] = useState(false);
  const [editingWaterId, setEditingWaterId] = useState<string | null>(null);
  const [editingWaterAmount, setEditingWaterAmount] = useState<number>(0);
  const [deletingWaterId, setDeletingWaterId] = useState<string | null>(null);

  // Sync with prop changes (SSR hydration)
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  const addWater = useCallback(
    async (amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid amount");
        return;
      }

      setWaterSaving(true);

      // Create timestamp based on selected date and current time
      const now = new Date();
      const [year, month, day] = selectedDate.split("-").map(Number);
      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      const loggedAt = targetDate.toISOString();

      // Optimistic update
      const optimisticId = `water_${Date.now()}`;
      const optimisticLog: WaterLog = {
        id: optimisticId,
        amount_ml: amount,
        logged_at: loggedAt,
        isOptimistic: true,
      };

      setLogs((prev) => [optimisticLog, ...prev]);

      try {
        const saved = await logWater(amount, loggedAt);
        
        // Replace optimistic with real data
        setLogs((prev) =>
          prev.map((log) => (log.id === optimisticId ? { ...saved } : log))
        );
        
        toast.success("Water logged");
        setWaterAmount(amount); // Remember last amount
        router.refresh();
      } catch (err) {
        console.error(err);
        
        // Rollback optimistic update
        setLogs((prev) => prev.filter((log) => log.id !== optimisticId));
        
        toast.error(err instanceof Error ? err.message : "Unable to log water");
      } finally {
        setWaterSaving(false);
      }
    },
    [selectedDate, router]
  );

  const startEditWater = useCallback((log: WaterLog) => {
    setEditingWaterId(log.id);
    setEditingWaterAmount(log.amount_ml);
  }, []);

  const cancelEditWater = useCallback(() => {
    setEditingWaterId(null);
    setEditingWaterAmount(0);
  }, []);

  const updateWater = useCallback(
    async (id: string, amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid amount");
        return;
      }

      const previousLogs = logs;

      // Optimistic update
      setLogs((prev) =>
        prev.map((log) => (log.id === id ? { ...log, amount_ml: amount } : log))
      );
      setEditingWaterId(null);

      try {
        await updateWaterLog(id, amount);
        toast.success("Water updated");
        router.refresh();
      } catch (err) {
        console.error(err);
        
        // Rollback
        setLogs(previousLogs);
        
        toast.error(err instanceof Error ? err.message : "Unable to update water");
      }
    },
    [logs, router]
  );

  const deleteWater = useCallback(
    async (id: string) => {
      const previousLogs = logs;
      setDeletingWaterId(id);

      // Optimistic delete
      setLogs((prev) => prev.filter((log) => log.id !== id));

      try {
        await deleteWaterLog(id);
        toast.success("Water deleted");
        router.refresh();
      } catch (err) {
        console.error(err);
        
        // Rollback
        setLogs(previousLogs);
        
        toast.error(err instanceof Error ? err.message : "Unable to delete water");
      } finally {
        setDeletingWaterId(null);
      }
    },
    [logs, router]
  );

  return {
    logs,
    waterAmount,
    waterSaving,
    editingWaterId,
    editingWaterAmount,
    deletingWaterId,
    addWater,
    updateWater,
    deleteWater,
    startEditWater,
    cancelEditWater,
    setWaterAmount,
  };
}
