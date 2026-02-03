// src/components/tracking/WaterTracker.tsx
"use client";

import React, { useMemo } from "react";
import { WaterLogEntry } from "./WaterLogEntry";
import type { UseWaterTrackingReturn } from "@/types/water";

interface WaterTrackerProps extends UseWaterTrackingReturn {
  waterGoal?: number;
}

export function WaterTracker({
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
  waterGoal = 2000,
}: WaterTrackerProps) {
  const waterTotal = useMemo(
    () => logs.reduce((total, log) => total + Number(log.amount_ml ?? 0), 0),
    [logs]
  );

  const waterProgress = Math.min(waterTotal / waterGoal, 1);

  const quickAddAmounts = [250, 500, 750, 1000];

  return (
    <section className="card space-y-4">
      {/* Header */}
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

      {/* Progress Bar */}
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

      {/* Input Controls */}
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
            onChange={(e) => setWaterAmount(Number(e.target.value))}
          />
        </label>
        <button
          className="btn"
          disabled={waterSaving}
          onClick={() => addWater(waterAmount)}
          type="button"
        >
          {waterSaving ? "Saving..." : "Add water"}
        </button>
        
        {/* Quick Add Buttons */}
        <div className="flex flex-wrap gap-2">
          {quickAddAmounts.map((amount) => (
            <button
              className="pill bg-white/10 text-white hover:bg-white/20"
              key={amount}
              onClick={() => addWater(amount)}
              type="button"
            >
              +{amount} ml
            </button>
          ))}
        </div>
      </div>

      {/* Log Entries */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
          No water logs yet. Add your first entry to start tracking.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-white/50">Recent entries</p>
          {logs.slice(0, 5).map((log) => (
            <WaterLogEntry
              key={log.id}
              log={log}
              isEditing={editingWaterId === log.id}
              editAmount={editingWaterAmount}
              isDeleting={deletingWaterId === log.id}
              onEdit={() => startEditWater(log)}
              onSave={(amount) => updateWater(log.id, amount)}
              onCancel={cancelEditWater}
              onDelete={() => deleteWater(log.id)}
              onAmountChange={setWaterAmount}
            />
          ))}
        </div>
      )}
    </section>
  );
}
