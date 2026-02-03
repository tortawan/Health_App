// src/components/tracking/WaterLogEntry.tsx
"use client";

import React from "react";
import type { WaterLog } from "@/types/water";

interface WaterLogEntryProps {
  log: WaterLog;
  isEditing: boolean;
  editAmount: number;
  isDeleting: boolean;
  onEdit: () => void;
  onSave: (amount: number) => void;
  onCancel: () => void;
  onDelete: () => void;
  onAmountChange: (amount: number) => void;
}

export function WaterLogEntry({
  log,
  isEditing,
  editAmount,
  isDeleting,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onAmountChange,
}: WaterLogEntryProps) {
  if (isEditing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white/80">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
            min={50}
            step={50}
            type="number"
            value={editAmount}
            onChange={(e) => onAmountChange(Number(e.target.value))}
          />
          <button 
            className="btn" 
            onClick={() => onSave(editAmount)} 
            type="button"
          >
            Save
          </button>
          <button
            className="btn bg-white/10 text-white hover:bg-white/20"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white/80">
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
          onClick={onEdit}
          type="button"
        >
          ✏️ Edit
        </button>
        <button
          className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
          disabled={isDeleting}
          onClick={onDelete}
          type="button"
        >
          {isDeleting ? "Deleting..." : "🗑️ Delete"}
        </button>
      </div>
    </div>
  );
}
