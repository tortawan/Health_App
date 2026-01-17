"use client";

import React from "react";
import { FoodLogRecord } from "@/types/food";
import { formatNumber } from "@/lib/format";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

type Props = {
  dailyLogs: FoodLogRecord[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number };
  macroTargets: { protein: number; carbs: number; fat: number };
  calorieTarget: number;
  todayLabel: string;
  selectedDate: string;
  onShiftDate: (delta: number) => void;
  onNavigateToDate: (value: string) => void;
  isCopyingDay: boolean;
  onCopyYesterday: () => void;
  editingLogId: string | null;
  editForm: Partial<FoodLogRecord>;
  onEditField: (field: keyof FoodLogRecord, value: string | number | null) => void;
  onBeginEdit: (log: FoodLogRecord) => void;
  onSaveEdits: () => void;
  onCancelEdit: () => void;
  onFlagLog: (log: FoodLogRecord) => void;
  deletingId: string | null;
  onDeleteLog: (id: string) => void;
};

export function DailyLogList({
  dailyLogs,
  dailyTotals,
  todayLabel,
  selectedDate,
  onShiftDate,
  onNavigateToDate,
  isCopyingDay,
  onCopyYesterday,
  editingLogId,
  editForm,
  onEditField,
  onBeginEdit,
  onSaveEdits,
  onCancelEdit,
  onFlagLog,
  deletingId,
  onDeleteLog,
  macroTargets,
  calorieTarget,
}: Props) {
  const macroChartData = [
    {
      key: "protein",
      label: "Protein",
      value: Math.max(0, dailyTotals.protein),
      target: Math.max(macroTargets.protein || 0, 1),
      color: "#38bdf8",
      kcalPerGram: 4,
    },
    {
      key: "carbs",
      label: "Carbs",
      value: Math.max(0, dailyTotals.carbs),
      target: Math.max(macroTargets.carbs || 0, 1),
      color: "#fbbf24",
      kcalPerGram: 4,
    },
    {
      key: "fat",
      label: "Fat",
      value: Math.max(0, dailyTotals.fat),
      target: Math.max(macroTargets.fat || 0, 1),
      color: "#f472b6",
      kcalPerGram: 9,
    },
  ];

  const targetMacroCalories = macroChartData.reduce(
    (total, item) => total + item.target * item.kcalPerGram,
    0,
  );
  const consumedMacroCalories = macroChartData.reduce(
    (total, item) => total + item.value * item.kcalPerGram,
    0,
  );
  const macroProgress =
    targetMacroCalories > 0
      ? Math.min(consumedMacroCalories / targetMacroCalories, 1)
      : 0;

  const proteinGoalMet =
    macroTargets.protein > 0 && dailyTotals.protein >= macroTargets.protein;

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-emerald-200">Daily log</p>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-white">{todayLabel}</h3>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/70">
              <button aria-label="Previous day" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => onShiftDate(-1)} type="button">
                ←
              </button>
              <input
                className="rounded bg-transparent px-2 py-1 outline-none"
                max={new Date().toISOString().slice(0, 10)}
                type="date"
                value={selectedDate}
                onChange={(event) => onNavigateToDate(event.target.value)}
              />
              <button aria-label="Next day" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => onShiftDate(1)} type="button">
                →
              </button>
            </div>
            <button className="btn bg-white/10 text-white hover:bg-white/20" disabled={isCopyingDay} onClick={onCopyYesterday} type="button">
              {isCopyingDay ? "Copying..." : "Copy yesterday"}
            </button>
          </div>
          <p className="text-sm text-white/60">Totals are summed from your food_logs entries for the selected date.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <div className="relative h-28 w-28">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={macroChartData}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={56}
                  paddingAngle={3}
                  stroke="none"
                >
                  {macroChartData.map((item) => (
                    <Cell fill={item.color} key={item.key} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-xs text-white">
              <span className="text-lg font-semibold">{Math.round(macroProgress * 100)}%</span>
              <span className="text-white/60">macro mix</span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-white/60">Macro donut</p>
            <div className="space-y-1">
              {macroChartData.map((item) => (
                <div className="flex items-center gap-2" key={item.key}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <p className="text-white/80">
                    {item.label}: {formatNumber(item.value, 0)}g / {formatNumber(item.target, 0)}g
                  </p>
                </div>
              ))}
            </div>
            <p className={`font-semibold ${proteinGoalMet ? "text-emerald-400" : "text-amber-200"}`}>
              {proteinGoalMet
                ? "Protein goal hit for today 🎉"
                : `Protein goal: ${formatNumber(dailyTotals.protein, 0)} / ${formatNumber(macroTargets.protein, 0)}g`}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-50">
            <p className="font-semibold">Daily Total</p>
            <p className="flex flex-wrap gap-3">
              <span>Kcal {formatNumber(dailyTotals.calories, 0)} / {formatNumber(calorieTarget, 0)}</span>
              <span>Protein {formatNumber(dailyTotals.protein)}g</span>
              <span>Carbs {formatNumber(dailyTotals.carbs)}g</span>
              <span>Fat {formatNumber(dailyTotals.fat)}g</span>
            </p>
          </div>
        </div>
      </div>

      {!dailyLogs.length ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
          Track your first meal to see it here. Confirm a draft entry to start your daily streak.
        </div>
      ) : (
        <div className="space-y-3">
          {dailyLogs.map((log) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm" key={log.id}>
              <div className="space-y-1">
                {editingLogId === log.id ? (
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/70 sm:grid-cols-3">
                    <input
                      className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white opacity-50"
                      value={editForm.food_name ?? ""}
                      readOnly
                    />
                    <input
                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                      type="number"
                      value={editForm.weight_g ?? 0}
                      onChange={(e) => onEditField("weight_g", Number(e.target.value))}
                    />
                    <input
                      className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white opacity-50"
                      type="number"
                      value={editForm.calories ?? 0}
                      readOnly
                    />
                    <input
                      className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white opacity-50"
                      type="number"
                      value={editForm.protein ?? 0}
                      readOnly
                    />
                    <input
                      className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white opacity-50"
                      type="number"
                      value={editForm.carbs ?? 0}
                      readOnly
                    />
                    <input
                      className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white opacity-50"
                      type="number"
                      value={editForm.fat ?? 0}
                      readOnly
                    />
                    <div className="col-span-2 flex gap-2 sm:col-span-3">
                      <button className="btn" onClick={onSaveEdits} type="button">
                        Save
                      </button>
                      <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={onCancelEdit} type="button">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-base font-semibold text-white">{log.food_name}</p>
                    <p className="text-white/60">
                      {log.weight_g}g •{" "}
                      <span suppressHydrationWarning>
                        {new Date(log.consumed_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-white/80">
                <span className="pill bg-white/10">Kcal {formatNumber(log.calories, 0)}</span>
                <span className="pill bg-white/10">Protein {formatNumber(log.protein)}g</span>
                <span className="pill bg-white/10">Carbs {formatNumber(log.carbs)}g</span>
                <span className="pill bg-white/10">Fat {formatNumber(log.fat)}g</span>
                <button aria-label="Edit entry" className="pill bg-white/10 text-white hover:bg-white/20" onClick={() => onBeginEdit(log)} type="button">
                  ✏️ Edit
                </button>
                <button
                  aria-label="Report issue"
                  className="pill bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
                  onClick={() => onFlagLog(log)}
                  type="button"
                >
                  🚩 Report
                </button>
                <button
                  aria-label="Delete entry"
                  className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
                  disabled={deletingId === log.id}
                  onClick={() => onDeleteLog(log.id)}
                  type="button"
                >
                  {deletingId === log.id ? "Deleting..." : "🗑️ Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
