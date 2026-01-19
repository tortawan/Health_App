"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { deleteWeightLog, logWeight, updateWeightLog } from "./actions";

type WeightLog = {
  id: string;
  weight_kg: number;
  logged_at: string;
};

export default function WeightLogger({
  defaultWeight,
  initialLogs = [],
}: {
  defaultWeight?: number | null;
  initialLogs?: WeightLog[];
}) {
  const [weight, setWeight] = useState<number>(defaultWeight ?? 70);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>(
    [...initialLogs].sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
    ),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState<number>(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toUtcDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return new Date().toISOString();
    }
    const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return utcDate.toISOString();
  };

  const submit = async () => {
    if (!weight || weight <= 0) {
      toast.error("Enter a valid weight in kg");
      return;
    }

    setLoading(true);
    const optimisticId = `weight_${Date.now()}`;
    const optimisticLog: WeightLog = {
      id: optimisticId,
      weight_kg: weight,
      logged_at: toUtcDate(date),
    };
    setWeightLogs((prev) => [optimisticLog, ...prev]);
    try {
      const saved = await logWeight(weight, toUtcDate(date));
      if (saved) {
        setWeightLogs((prev) =>
          prev.map((log) => (log.id === optimisticId ? saved : log)),
        );
      }
      toast.success("Weight saved");
    } catch (err) {
      console.error(err);
      setWeightLogs((prev) => prev.filter((log) => log.id !== optimisticId));
      toast.error(err instanceof Error ? err.message : "Unable to save weight");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (log: WeightLog) => {
    setEditingId(log.id);
    setEditingWeight(log.weight_kg);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editingWeight || editingWeight <= 0) {
      toast.error("Enter a valid weight in kg");
      return;
    }
    const previousLogs = weightLogs;
    setWeightLogs((prev) =>
      prev.map((log) =>
        log.id === editingId ? { ...log, weight_kg: editingWeight } : log,
      ),
    );
    setEditingId(null);
    try {
      await updateWeightLog(editingId, editingWeight);
      toast.success("Weight updated");
    } catch (err) {
      console.error(err);
      setWeightLogs(previousLogs);
      toast.error(err instanceof Error ? err.message : "Unable to update weight");
    }
  };

  const handleDelete = async (id: string) => {
    const previousLogs = weightLogs;
    setDeletingId(id);
    setWeightLogs((prev) => prev.filter((log) => log.id !== id));
    try {
      await deleteWeightLog(id);
      toast.success("Weight deleted");
    } catch (err) {
      console.error(err);
      setWeightLogs(previousLogs);
      toast.error(err instanceof Error ? err.message : "Unable to delete weight");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Body weight
          </p>
          <h2 className="text-xl font-semibold text-white">Log today&apos;s weight</h2>
        </div>
        <span className="pill bg-white/10 text-white/70">History feeds charts</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide text-white/60">
            Weight (kg)
          </span>
          <input
            className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            type="number"
            min={1}
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide text-white/60">
            Date
          </span>
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="btn" disabled={loading} onClick={submit} type="button">
          {loading ? "Saving..." : "Save weight"}
        </button>
      </div>
      {weightLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
          No weight logs yet. Save your first entry to build a trend.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-white/50">Recent entries</p>
          {weightLogs.slice(0, 5).map((log) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white/80"
              key={log.id}
            >
              {editingId === log.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                    min={1}
                    step="0.1"
                    type="number"
                    value={editingWeight}
                    onChange={(event) => setEditingWeight(Number(event.target.value))}
                  />
                  <button className="btn" onClick={saveEdit} type="button">
                    Save
                  </button>
                  <button
                    className="btn bg-white/10 text-white hover:bg-white/20"
                    onClick={() => setEditingId(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-base font-semibold text-white">{log.weight_kg} kg</p>
                    <p className="text-xs text-white/60">
                      {new Date(log.logged_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="pill bg-white/10 text-white hover:bg-white/20"
                      onClick={() => startEdit(log)}
                      type="button"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
                      disabled={deletingId === log.id}
                      onClick={() => handleDelete(log.id)}
                      type="button"
                    >
                      {deletingId === log.id ? "Deleting..." : "🗑️ Delete"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
