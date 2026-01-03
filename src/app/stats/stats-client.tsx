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
};

export default function StatsClient({
  data,
  target,
}: {
  data: ChartRow[];
  target: number;
}) {
  const [mode, setMode] = useState<"calories" | "macros">("calories");

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        goal: target,
      })),
    [data, target],
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

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Weekly trends
          </p>
          <h1 className="text-2xl font-semibold text-white">
            {mode === "calories" ? "Calories vs. goal" : "Macro trends"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/5 text-xs text-white">
            <button
              className={`rounded-full px-3 py-1 ${mode === "calories" ? "bg-emerald-500 text-white" : ""}`}
              onClick={() => setMode("calories")}
              type="button"
            >
              Calories
            </button>
            <button
              className={`rounded-full px-3 py-1 ${mode === "macros" ? "bg-emerald-500 text-white" : ""}`}
              onClick={() => setMode("macros")}
              type="button"
            >
              Macro Trends
            </button>
          </div>
          <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
            Back to tracker
          </Link>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "calories" ? (
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
              <Bar dataKey="goal" fill="#2563eb" name="Goal" yAxisId="calories" />
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
          ) : (
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
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
