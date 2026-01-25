"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { type ActivityLevel, type GoalType } from "@/lib/nutrition";
// FIX: Import from specific 'user' action file
import { upsertUserProfile } from "../actions/user";

export function OnboardingClient({
  defaults,
}: {
  defaults: {
    height: number;
    weight: number;
    age: number;
    activityLevel: ActivityLevel;
    goalType: GoalType;
  };
}) {
  const [form, setForm] = useState(defaults);
  const [saving, startSaving] = useTransition();
  const router = useRouter();

  const submit = () => {
    startSaving(async () => {
      try {
        await upsertUserProfile({
          height: form.height,
          weight: form.weight,
          age: form.age,
          activityLevel: form.activityLevel,
          goalType: form.goalType,
          macroSplit: { protein: 30, carbs: 40, fat: 30 },
        });
        toast.success("Targets saved");
        router.push("/");
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Unable to save profile");
      }
    });
  };

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-emerald-200">
          Welcome
        </p>
        <h1 className="text-2xl font-semibold text-white">Set your targets</h1>
        <p className="text-sm text-white/60">
          We need a few details to calculate your calorie and protein goals.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-white/70">
          Height (cm)
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            type="number"
            value={form.height}
            onChange={(e) => setForm((prev) => ({ ...prev, height: Number(e.target.value) }))}
          />
        </label>
        <label className="space-y-1 text-sm text-white/70">
          Weight (kg)
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            type="number"
            value={form.weight}
            onChange={(e) => setForm((prev) => ({ ...prev, weight: Number(e.target.value) }))}
          />
        </label>
        <label className="space-y-1 text-sm text-white/70">
          Age
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            type="number"
            value={form.age}
            onChange={(e) => setForm((prev) => ({ ...prev, age: Number(e.target.value) }))}
          />
        </label>
        <label className="space-y-1 text-sm text-white/70">
          Activity level
          <select
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            value={form.activityLevel}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, activityLevel: e.target.value as ActivityLevel }))
            }
          >
            <option value="sedentary">Sedentary</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="active">Active</option>
            <option value="very_active">Very active</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-white/70">
          Goal
          <select
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
            value={form.goalType}
            onChange={(e) => setForm((prev) => ({ ...prev, goalType: e.target.value as GoalType }))}
          >
            <option value="lose">Lose weight</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain</option>
          </select>
        </label>
      </div>
      <button className="btn" disabled={saving} onClick={submit} type="button">
        {saving ? "Saving..." : "Save & continue"}
      </button>
    </div>
  );
}