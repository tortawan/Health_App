"use client";

import Link from "next/link";
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

export default function StatsClient({
  data,
  target,
}: {
  data: { label: string; calories: number; weight: number | null }[];
  target: number;
}) {
  const chartData = data.map((row) => ({
    ...row,
    goal: target,
  }));

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Weekly trends
          </p>
          <h1 className="text-2xl font-semibold text-white">Calories vs. goal</h1>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to tracker
        </Link>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
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
        </ResponsiveContainer>
      </div>
    </div>
  );
}
