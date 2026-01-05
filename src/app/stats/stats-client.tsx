"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from "recharts";

type ChartRow = {
  label: string;
  calories: number;
  weight: number | null;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
};

export default function StatsClient({
  data,
  targets,
}: {
  data: ChartRow[];
  targets: {
    calories: number;
    protein: number;
  };
}) {
  const [mode, setMode] = useState<"intake" | "macros" | "micros">("intake");
  const [intakeMetric, setIntakeMetric] = useState<"calories" | "protein">(
    "calories",
  );

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        calorieGoal: targets.calories,
        proteinGoal: targets.protein,
      })),
    [data, targets.calories, targets.protein],
  );

  const macroRatios = useMemo(
    () =>
      data.map((row) => {
        const total = row.protein + row.carbs + row.fat;
        const safeTotal = total || 1;
        return {
          ...row,
          proteinRatio: (row.protein / safeTotal) * 100,
          carbsRatio: (row.carbs / safeTotal) * 100,
          fatRatio: (row.fat / safeTotal) * 100,
        };
      }),
    [data],
  );

  const micronutrients = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        fiberGoal: 30,
        sodiumLimit: 2300,
      })),
    [data],
  );

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Weekly trends
          </p>
          <h1 className="text-2xl font-semibold text-white">
            {mode === "intake"
              ? intakeMetric === "calories"
                ? "Calories vs. goal"
                : "Protein vs. goal"
              : mode === "macros"
                ? "Macro trends"
                : "Micronutrients"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/5 text-xs text-white">
            <button
              className={`rounded-full px-3 py-1 ${mode === "intake" ? "bg-emerald-500 text-white" : ""}`}
              onClick={() => setMode("intake")}
              type="button"
            >
              Intake
            </button>
            <button
              className={`rounded-full px-3 py-1 ${mode === "macros" ? "bg-emerald-500 text-white" : ""}`}
              onClick={() => setMode("macros")}
              type="button"
            >
              Macro Trends
            </button>
            <button
              className={`rounded-full px-3 py-1 ${mode === "micros" ? "bg-emerald-500 text-white" : ""}`}
              onClick={() => setMode("micros")}
              type="button"
            >
              Micronutrients
            </button>
          </div>
          {mode === "intake" && (
            <div className="rounded-full border border-white/10 bg-white/5 text-xs text-white">
              <button
                className={`rounded-full px-3 py-1 ${intakeMetric === "calories" ? "bg-emerald-500 text-white" : ""}`}
                onClick={() => setIntakeMetric("calories")}
                type="button"
              >
                Calories
              </button>
              <button
                className={`rounded-full px-3 py-1 ${intakeMetric === "protein" ? "bg-emerald-500 text-white" : ""}`}
                onClick={() => setIntakeMetric("protein")}
                type="button"
              >
                Protein
              </button>
            </div>
          )}
          <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
            Back to tracker
          </Link>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "intake"
            ? (
              intakeMetric === "calories"
                ? (
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" yAxisId="calories" />
                    <YAxis stroke="#fbbf24" yAxisId="weight" orientation="right" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", color: "white", border: "1px solid #1f2937" }}
                    />
                    <Legend />
                    <Bar dataKey="calories" fill="#34d399" name="Calories" yAxisId="calories" />
                    <Bar dataKey="calorieGoal" fill="#2563eb" name="Calorie goal" yAxisId="calories" />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Weight (kg)"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      yAxisId="weight"
                      dot={{ stroke: "#fbbf24", fill: "#0f172a" }}
                    />
                  </ComposedChart>
                )
                : (
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" yAxisId="protein" tickFormatter={(v) => `${v}g`} />
                    <YAxis stroke="#fbbf24" yAxisId="weight" orientation="right" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", color: "white", border: "1px solid #1f2937" }}
                    />
                    <Legend />
                    <Bar dataKey="protein" fill="#38bdf8" name="Protein (g)" yAxisId="protein" />
                    <Bar dataKey="proteinGoal" fill="#2563eb" name="Protein goal" yAxisId="protein" />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Weight (kg)"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      yAxisId="weight"
                      dot={{ stroke: "#fbbf24", fill: "#0f172a" }}
                    />
                  </ComposedChart>
                )
            )
            : mode === "macros"
              ? (
                <ComposedChart data={macroRatios}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", color: "white", border: "1px solid #1f2937" }}
                    formatter={(value, name, props) => {
                      const key = name.toString().toLowerCase();
                      const gramsKey = key.replace(" ratio", "");
                      const grams = props.payload?.[gramsKey];
                      return [`${Number(value).toFixed(1)}% (${grams ?? 0}g)`, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="proteinRatio" stackId="macro" fill="#38bdf8" name="Protein ratio" />
                  <Bar dataKey="carbsRatio" stackId="macro" fill="#fbbf24" name="Carb ratio" />
                  <Bar dataKey="fatRatio" stackId="macro" fill="#f472b6" name="Fat ratio" />
                </ComposedChart>
              )
              : (
                <ComposedChart data={micronutrients}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" yAxisId="fiber" tickFormatter={(v) => `${v}g`} />
                  <YAxis stroke="#f472b6" yAxisId="sodium" orientation="right" tickFormatter={(v) => `${v}mg`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", color: "white", border: "1px solid #1f2937" }}
                  />
                  <Legend />
                  <Bar dataKey="fiber" fill="#34d399" name="Fiber (g)" yAxisId="fiber" />
                  <Bar dataKey="fiberGoal" fill="#2563eb" name="Fiber goal (30g)" yAxisId="fiber" />
                  <Bar dataKey="sodium" fill="#f472b6" name="Sodium (mg)" yAxisId="sodium" />
                  <Bar dataKey="sodiumLimit" fill="#f59e0b" name="Sodium limit (2300mg)" yAxisId="sodium" />
                </ComposedChart>
              )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
