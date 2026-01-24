import { useMemo } from "react";
import { FoodLogRecord } from "@/types/food";

export function useDailyMacros(logs: FoodLogRecord[]) {
  return useMemo(
    () =>
      logs.reduce(
        (totals, log) => ({
          calories: totals.calories + (log.calories ?? 0),
          protein: totals.protein + (log.protein ?? 0),
          carbs: totals.carbs + (log.carbs ?? 0),
          fat: totals.fat + (log.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [logs],
  );
}
