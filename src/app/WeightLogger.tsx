"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { logWeight } from "./actions";

export default function WeightLogger({
  defaultWeight,
}: {
  defaultWeight?: number | null;
}) {
  const [weight, setWeight] = useState<number>(defaultWeight ?? 70);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

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
    try {
      await logWeight(weight, toUtcDate(date));
      toast.success("Weight saved");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to save weight");
    } finally {
      setLoading(false);
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
    </div>
  );
}
