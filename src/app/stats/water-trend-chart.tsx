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

type WaterPoint = {
  date: string;
  label: string;
  total_ml: number;
  goal: number;
};

export default function WaterTrendChart({ data }: { data: WaterPoint[] }) {
  const hasData = data.some((point) => point.total_ml > 0);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Hydration
          </p>
          <h2 className="text-xl font-semibold text-white">
            Water trend (last 30 days)
          </h2>
          <p className="text-sm text-white/60">
            Daily totals with a 2000 ml goal line.
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
                tickFormatter={(value) => `${value} ml`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  color: "white",
                  border: "1px solid #1f2937",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "goal") {
                    return [`${value} ml`, "Goal"];
                  }
                  return [`${value} ml`, "Water"];
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
                dataKey="total_ml"
                name="Water"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ stroke: "#38bdf8", fill: "#0f172a" }}
              />
              <Line
                type="monotone"
                dataKey="goal"
                name="goal"
                stroke="#fbbf24"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-900/50 text-sm text-white/60">
            No water logs yet. Add your first entry to unlock the trend chart.
          </div>
        )}
      </div>
    </div>
  );
}
