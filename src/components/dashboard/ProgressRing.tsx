"use client";

import { formatNumber } from "@/lib/format";

type Props = {
  consumedCalories: number;
  dailyTarget: number;
};

export function ProgressRing({ consumedCalories, dailyTarget }: Props) {
  const radius = 54;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = dailyTarget > 0 ? Math.min(consumedCalories / dailyTarget, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140">
          <circle
            className="text-white/10"
            cx="70"
            cy="70"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <circle
            className="text-emerald-400"
            cx="70"
            cy="70"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={stroke}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="text-2xl font-semibold">{Math.round(progress * 100)}%</span>
          <span className="text-xs text-white/60">of goal</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-white/50">Calories</p>
        <p className="text-lg font-semibold text-white">
          {formatNumber(consumedCalories, 0)} / {formatNumber(dailyTarget, 0)} kcal
        </p>
      </div>
    </div>
  );
}
