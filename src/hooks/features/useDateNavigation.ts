import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useDateNavigation(initialSelectedDate: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(
    initialSelectedDate ?? new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    if (initialSelectedDate) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate]);

  const navigateToDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", dateStr);
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  const handleShiftDate = useCallback((delta: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + delta);
    const newDateStr = date.toISOString().split("T")[0];
    navigateToDate(newDateStr);
  }, [selectedDate, navigateToDate]);

  return {
    selectedDate,
    setSelectedDate: navigateToDate,
    handleShiftDate,
    isToday: selectedDate === new Date().toISOString().split("T")[0]
  };
}