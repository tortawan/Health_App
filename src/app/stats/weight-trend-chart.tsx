"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WeightPoint = {
  date: string;
  label: string;
  weight: number;
};

export default function WeightTrendChart({ data }: { data: WeightPoint[] }) {
  const hasData = data.length > 0;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Body weight
          </p>
          <h2 className="text-xl font-semibold text-white">
            Weight trend (last 30 days)
          </h2>
          <p className="text-sm text-white/60">
            Visualize changes over time. Add entries to keep this chart up to date.
          </p>
        </div>
        <span className="pill bg-white/10 text-xs text-white/70">
          Recharts line chart
        </span>
      </div>

      <div className="h-64 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" stroke="#9ca3af" />
              <YAxis
                stroke="#9ca3af"
                domain={[
                  (dataMin: number) => Math.floor(dataMin) - 2,
                  (dataMax: number) => Math.ceil(dataMax) + 2,
                ]}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  color: "white",
                  border: "1px solid #1f2937",
                }}
                labelFormatter={(_, payload) => {
                  const iso = payload?.[0]?.payload?.date as string | undefined;
                  if (!iso) return "";
                  return new Date(iso).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                name="Weight (kg)"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ stroke: "#34d399", fill: "#0f172a" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-900/50 text-sm text-white/60">
            No weight logs yet. Add your first entry to unlock the trend chart.
          </div>
        )}
      </div>
    </div>
  );
}
