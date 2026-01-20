"use client";

import React from "react";
import { formatNumber } from "@/lib/format";
import type { RequestMetricRow } from "@/app/actions";

type MetricsSummary = {
  avgDuration: number;
  failRate: number;
  cbOpenCount: number;
};

type MetricsPayload = {
  rows: RequestMetricRow[];
  summary: MetricsSummary | null;
  error: string | null;
};

type Props = {
  metrics: MetricsPayload;
};

export function DiagnosticsClient({ metrics }: Props) {
  const { rows, summary } = metrics;

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6 text-center text-sm text-white/60">
        No diagnostics yet. Run analyze to populate request metrics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Avg duration</p>
            <p className="text-3xl font-semibold text-white">
              {Math.round(summary.avgDuration)} ms
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Gemini fail rate</p>
            <p className="text-3xl font-semibold text-white">
              {formatNumber(summary.failRate * 100, 1)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">CB opens (24h)</p>
            <p className="text-3xl font-semibold text-white">{summary.cbOpenCount}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/60">Requests</p>
            <h2 className="text-lg font-semibold text-white">Recent analyze metrics</h2>
            <p className="text-sm text-white/60">Showing the last 50 analyze calls.</p>
          </div>
          <span className="pill bg-white/5 text-white/70">{rows.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white/80">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-white/60">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Duration</th>
                <th className="px-2 py-2">Gemini</th>
                <th className="px-2 py-2">Threshold</th>
                <th className="px-2 py-2">Matches</th>
                <th className="px-2 py-2">RPC error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-2 py-2 text-white/70">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2">{row.duration_ms} ms</td>
                  <td className="px-2 py-2 uppercase text-white/70">
                    {row.gemini_status}
                  </td>
                  <td className="px-2 py-2">
                    {row.match_threshold_used?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-2 py-2">{row.matches_count ?? "—"}</td>
                  <td className="px-2 py-2 text-amber-200/80">
                    {row.rpc_error_code ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
