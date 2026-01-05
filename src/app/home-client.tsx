"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  deleteFoodLog,
  manualSearch,
  applyMealTemplate,
  getRecentFoods,
  saveMealTemplate,
  signOutAction,
  updateFoodLog,
  upsertUserProfile,
  deleteMealTemplate,
  copyDay,
  logWater,
  reportLogIssue,
} from "./actions";
import { useProfileForm } from "./hooks/useProfileForm";
import { useScanner } from "./hooks/useScanner";
import { CameraCapture } from "@/components/scanner/CameraCapture";
import { DailyLogList } from "@/components/dashboard/DailyLogList";
import { DraftReview } from "@/components/logging/DraftReview";
import { ManualSearchModal } from "@/components/logging/ManualSearchModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { adjustedMacros } from "@/lib/nutrition";
import {
  DraftLog,
  FoodLogRecord,
  MacroMatch,
  MealTemplate,
  MealTemplateItem,
  PortionMemoryRow,
  RecentFood,
  UserProfile,
} from "@/types/food";
import { formatNumber } from "@/lib/format";

type RecentFood = {
  food_name: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  weight_g: number;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type ClientMealTemplate = MealTemplate & { items: MealTemplateItem[] };

function extractWeight(estimate: string) {
  const parsed = estimate.match(/(\d+(?:\.\d+)?)\s*g?/i);
  if (parsed?.[1]) return Number(parsed[1]);
  return 100;
}

function buildDateFromInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRingStyle(progress: number, isOver: boolean) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const percent = clamped * 360;
  const base = isOver ? "#ef4444" : "#10b981";
  const bg = "rgba(255,255,255,0.08)";

  return {
    background: `conic-gradient(${base} ${percent}deg, ${bg} 0deg)`,
  };
}

function buildDonutStyle(progress: number, color: string) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const percent = clamped * 360;
  const bg = "rgba(255,255,255,0.08)";

  return {
    background: `conic-gradient(${color} ${percent}deg, ${bg} 0deg)`,
  };
}

async function submitLogFood(payload: {
  foodName: string;
  weight: number;
  match?: MacroMatch;
  imageUrl?: string | null;
  manualMacros?: {
    calories: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
}) {
  const response = await fetch("/api/log-food", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 202) {
    return { queued: true, data: null };
  }

  if (!response.ok) {
    const payloadText = await response.text();
    throw new Error(payloadText || "Unable to save your log entry.");
  }

  return { queued: false, data: await response.json() };
}

async function resizeImageFile(file: File) {
  const maxSize = 1024;
  const image = document.createElement("img");
  const reader = new FileReader();

  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  image.src = dataUrl;

  await new Promise((resolve, reject) => {
    image.onload = () => resolve(null);
    image.onerror = () => reject(new Error("Unable to load image for resizing"));
  });

  const { width, height } = image;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Unable to compress image"));
      },
      "image/webp",
      0.8,
    );
  });

  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
    type: "image/webp",
  });
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unexpected UI error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/40 bg-red-900/40 p-6 text-red-50">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-100/80">
            We hit an unexpected issue. Try refreshing or switch to manual logging while we recover.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn bg-white/10 text-white hover:bg-white/20" type="button" onClick={() => location.reload()}>
              Refresh
            </button>
            <a className="btn" href="/login">
              Go to login
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Component error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          Something went wrong loading this section.
        </div>
      );
    }

    return this.props.children;
  }
}

export default function HomeClient({
  initialLogs,
  userEmail,
  selectedDate,
  profile,
  streak,
  templates,
  portionMemory,
  initialRecentFoods,
  initialWater,
}: {
  initialLogs: FoodLogRecord[];
  userEmail: string | null | undefined;
  selectedDate: string;
  profile: UserProfile;
  streak: number;
  templates: MealTemplate[];
  portionMemory: PortionMemoryRow[];
  initialRecentFoods: RecentFood[];
  initialWater: number;
}) {
  const [captureMode, setCaptureMode] = useState<"photo" | "manual">("photo");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draft, setDraft] = useState<DraftLog[]>([]);
  const [dailyLogs, setDailyLogs] = useState<FoodLogRecord[]>(initialLogs);
  const [error, setError] = useState<string | null>(null);
  const [editingWeightIndex, setEditingWeightIndex] = useState<number | null>(
    null,
  );
  const [manualOpenIndex, setManualOpenIndex] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<MacroMatch[]>([]);
  const [isSearching, startSearching] = useTransition();
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCalories, setQuickCalories] = useState<number | null>(null);
  const [quickProtein, setQuickProtein] = useState<number | null>(null);
  const [quickCarbs, setQuickCarbs] = useState<number | null>(null);
  const [quickFat, setQuickFat] = useState<number | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodLogRecord>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [templateList, setTemplateList] = useState<ClientMealTemplate[]>(templates as ClientMealTemplate[]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templates[0]?.id ?? null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [templateScale, setTemplateScale] = useState(1);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateBeingDeleted, setTemplateBeingDeleted] = useState<string | null>(null);
  const [portionMemoryList, setPortionMemoryList] = useState<PortionMemoryRow[]>(portionMemory);
  const [recentFoods, setRecentFoods] = useState<MacroMatch[]>(
    initialRecentFoods.map((item) => ({
      description: item.food_name,
      kcal_100g: item.calories,
      protein_100g: item.protein,
      carbs_100g: item.carbs,
      fat_100g: item.fat,
      fiber_100g: item.fiber,
      sugar_100g: item.sugar,
      sodium_100g: item.sodium,
    })),
  );
  const [isLoadingRecentFoods, setIsLoadingRecentFoods] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [waterIntake, setWaterIntake] = useState(initialWater);
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const [isCopyingDay, setIsCopyingDay] = useState(false);
  const [flaggingLog, setFlaggingLog] = useState<FoodLogRecord | null>(null);
  const [flagForm, setFlagForm] = useState<Partial<FoodLogRecord>>({});
  const [flagNotes, setFlagNotes] = useState("");
  const [isFlagging, setIsFlagging] = useState(false);
  const router = useRouter();
  const { profileForm, saveProfile, savingProfile, setProfileForm } = useProfileForm(
    profile,
    (message) => setError(message),
  );
  const handleBarcodeProduct = useCallback((macroMatch: MacroMatch) => {
    setManualResults([macroMatch]);
    setManualQuery(macroMatch.description);
    setDraft((prev) => {
      if (!prev.length) {
        return [
          {
            food_name: macroMatch.description,
            quantity_estimate: "1 serving",
            search_term: macroMatch.description,
            match: macroMatch,
            matches: [macroMatch],
            weight: 100,
          },
        ];
      }

      return prev.map((item, idx) =>
        idx === 0
          ? {
              ...item,
              match: macroMatch,
              matches: [macroMatch, ...(item.matches ?? [])].filter(
                (candidate, candidateIdx, list) =>
                  list.findIndex(
                    (entry) => entry.description === candidate.description,
                  ) === candidateIdx,
              ),
              food_name: macroMatch.description,
            }
          : item,
      );
    });
    setManualOpenIndex(0);
  }, []);
  const { hasScannerInstance, isScanningBarcode, scannerError, showScanner, toggleScanner } =
    useScanner({
      onProductLoaded: handleBarcodeProduct,
      onError: (message) => setError(message),
    });

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault?.();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  useEffect(() => {
    setWaterIntake(initialWater);
  }, [initialWater, selectedDate]);

  const confidenceLabel = useMemo(() => {
    if (!draft[0]?.match) return "Pending";
    const similarity = draft[0].match.similarity ?? 0;
    if (similarity >= 0.9) return "High confidence";
    if (similarity >= 0.75) return "Medium confidence";
    return "Low confidence - please verify manually";
  }, [draft]);

  const dailyTotals = useMemo(() => {
    return dailyLogs.reduce(
      (acc, item) => ({
        calories: acc.calories + Number(item.calories ?? 0),
        protein: acc.protein + Number(item.protein ?? 0),
        carbs: acc.carbs + Number(item.carbs ?? 0),
        fat: acc.fat + Number(item.fat ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [dailyLogs]);

  const calorieTarget = profile?.daily_calorie_target ?? 2000;
  const proteinTarget = profile?.daily_protein_target ?? 120;

  const selectedDateObj = useMemo(
    () => buildDateFromInput(selectedDate),
    [selectedDate],
  );
  const todayKey = useMemo(() => formatDateParam(new Date()), []);

  const portionMemoryMap = useMemo(() => {
    const map = new Map<string, { weight: number; count: number }>();
    portionMemoryList.forEach((row) => {
      const key = row.food_name.toLowerCase();
      const existing = map.get(key);
      if (!existing || row.count > existing.count) {
        map.set(key, { weight: row.weight_g, count: row.count });
      }
    });
    return new Map(Array.from(map.entries()).map(([key, value]) => [key, value.weight]));
  }, [portionMemoryList]);

  const macroTargets = useMemo(() => {
    const split = profileForm.macroSplit as Record<string, number>;
    const totalCalories = calorieTarget || 1;
    const proteinFromSplit = ((split?.protein ?? 0) / 100) * totalCalories / 4;
    const carbsTarget = ((split?.carbs ?? 0) / 100) * totalCalories / 4;
    const fatTarget = ((split?.fat ?? 0) / 100) * totalCalories / 9;

    return {
      protein: proteinFromSplit > 0 ? proteinFromSplit : proteinTarget,
      carbs: carbsTarget,
      fat: fatTarget,
    };
  }, [calorieTarget, proteinTarget, profileForm.macroSplit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedDate !== todayKey) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }

    navigator.serviceWorker?.ready
      .then((registration) => {
        registration.active?.postMessage({
          type: "scheduleLunchReminder",
          lastLogAt: dailyLogs[0]?.consumed_at ?? null,
        });
      })
      .catch(() => {});
  }, [dailyLogs, selectedDate, todayKey]);

  const bumpPortionMemory = (foodName: string, weight: number) => {
    setPortionMemoryList((prev) => {
      const existingIndex = prev.findIndex(
        (row) =>
          row.food_name.toLowerCase() === foodName.toLowerCase() &&
          Math.round(row.weight_g) === Math.round(weight),
      );

      if (existingIndex !== -1) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          count: next[existingIndex].count + 1,
        };
        return next;
      }

      return [{ food_name: foodName, weight_g: weight, count: 1 }, ...prev].slice(0, 200);
    });
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const handleAddWater = async (amount = 250) => {
    setWaterIntake((prev) => prev + amount);
    setIsLoggingWater(true);
    try {
      await logWater(amount);
      toast.success("Water logged");
    } catch (err) {
      console.error(err);
      setWaterIntake((prev) => Math.max(0, prev - amount));
      setError(
        err instanceof Error ? err.message : "Unable to log water right now.",
      );
      toast.error("Unable to log water");
    } finally {
      setIsLoggingWater(false);
    }
  };

  const navigateToDate = (value: string) => {
    if (!value) {
      router.push("/");
      return;
    }
    router.push(`/?date=${value}`);
  };

  const shiftDate = (delta: number) => {
    const adjusted = new Date(selectedDateObj);
    adjusted.setDate(adjusted.getDate() + delta);
    navigateToDate(formatDateParam(adjusted));
  };

  const onFileChange = async (file?: File) => {
    if (!file) return;
    setCaptureMode("photo");
    setError(null);
    setIsUploading(true);
    setIsImageUploading(true);
    setImagePublicUrl(null);
    setAnalysisNotice(null);
    setShowDraftModal(false);
    setDraft([]);

    let processed = file;
    try {
      processed = await resizeImageFile(file);
    } catch (resizeErr) {
      console.warn("Image resize failed, using original", resizeErr);
      toast.error("Using original size image; uploads may be slower.");
    }

    const reader = new FileReader();
    reader.onloadend = () => setFilePreview(reader.result as string);
    reader.readAsDataURL(processed);

    const uploadPromise = (async () => {
      if (!supabaseBrowser) {
        setError(
          "Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        );
        return null;
      }

      const bucket =
        process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "user-images";
      const extension =
        processed.name.split(".").pop() || processed.type.split("/")[1] || "jpg";
      const path = `uploads/${new Date()
        .toISOString()
        .slice(0, 10)}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseBrowser.storage
        .from(bucket)
        .upload(path, processed, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: publicUrlData,
        error: publicUrlError,
      } = supabaseBrowser.storage.from(bucket).getPublicUrl(path);

      if (publicUrlError) {
        throw publicUrlError;
      }

      return publicUrlData.publicUrl;
    })()
      .then((url) => {
        if (url) setImagePublicUrl(url);
        return url;
      })
      .catch((uploadErr) => {
        console.error(uploadErr);
        setError(
          uploadErr instanceof Error
            ? uploadErr.message
            : "Unable to upload the image to storage.",
        );
        toast.error("Image upload failed. You can still log without a photo.");
        return null;
      })
      .finally(() => setIsImageUploading(false));

    try {
      const analyzeWithRetry = async () => {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const formData = new FormData();
            formData.append("file", processed);

            const response = await fetch("/api/analyze", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              if (response.status === 413) {
                throw new Error("Image too large. Please upload a smaller photo.");
              }
              if (response.status >= 500) {
                throw new Error("AI overloaded. Retrying...");
              }
              throw new Error("Unable to analyze image. Please try again.");
            }

            const payload = (await response.json()) as {
              draft: DraftLog[];
              imagePath?: string;
              usedFallback?: boolean;
            };
            return payload;
          } catch (attemptError) {
            lastError =
              attemptError instanceof Error
                ? attemptError
                : new Error("Unexpected issue analyzing the image.");
            if (attempt < 3) {
              toast.error(lastError.message);
              await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
              continue;
            }
            throw lastError;
          }
        }
        throw lastError ?? new Error("Unable to analyze image.");
      };

      const payload = await analyzeWithRetry();

      const enhanced = payload.draft.map((item) => {
        const fallbackWeight = extractWeight(item.quantity_estimate);
        const memoryWeight = portionMemoryMap.get(item.food_name.toLowerCase());
        return {
          ...item,
          matches: item.matches ?? (item.match ? [item.match] : []),
          weight: memoryWeight ?? fallbackWeight,
        };
      });
      setDraft(enhanced);
      if (payload.usedFallback) {
        setAnalysisNotice("AI couldn't identify this photo. Please double-check or search manually.");
        toast.error("Gemini fell back — verify before saving.");
        if (payload.draft?.length) {
          setManualOpenIndex(0);
          setManualQuery(payload.draft[0]?.search_term ?? "");
        }
      } else {
        setAnalysisNotice(null);
      }
      if (enhanced.length) {
        setShowDraftModal(true);
      }
      if (payload.imagePath) setFilePreview(payload.imagePath);
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected issue analyzing the image.";
      setError(message);
      if (message.includes("too large")) {
        toast.error("Image too large");
      } else if (message.toLowerCase().includes("overloaded")) {
        toast.error("AI overloaded, please retry");
      } else if (message.toLowerCase().includes("fetch") || message.toLowerCase().includes("network")) {
        toast.error("Database connection lost");
      }
      setDraft([
        {
          food_name: "Manual entry",
          quantity_estimate: "100g",
          search_term: "manual search",
          weight: 100,
        },
      ]);
      setManualOpenIndex(0);
      setCaptureMode("manual");
      setAnalysisNotice("AI couldn't identify this photo. Please try manual search.");
    } finally {
      await uploadPromise;
      setIsUploading(false);
    }
  };

  const updateWeight = (index: number, weight: number) => {
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
    setDraft((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, weight: safeWeight } : item)),
    );
  };

  const openManualSearch = (index: number) => {
    setManualOpenIndex(index);
    setManualResults([]);
    setManualQuery(draft[index]?.search_term ?? "");
    void loadRecentFoodsList();
  };

  const runManualSearch = () => {
    startSearching(async () => {
      try {
        const results = await manualSearch(manualQuery);
        setManualResults(results);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to search. Please try again.",
        );
      }
    });
  };

  const applyManualResult = (result: MacroMatch) => {
    if (manualOpenIndex === null) return;
    setDraft((prev) =>
      prev.map((item, idx) =>
        idx === manualOpenIndex
          ? {
              ...item,
              match: result,
              matches: [result, ...(item.matches ?? [])].filter(
                (candidate, candidateIdx, list) =>
                  list.findIndex((entry) => entry.description === candidate.description) === candidateIdx,
              ),
            }
          : item,
      ),
    );
    setManualOpenIndex(null);
  };

  const handleConfirmAll = async () => {
    if (!draft.length) return;
    const toSave = draft
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.match && (item.match.similarity ?? 0) >= 0.7,
      );

    if (!toSave.length) {
      toast.error("No high-confidence matches to confirm.");
      return;
    }

    setIsConfirmingAll(true);
    setError(null);
    const savedIndices: number[] = [];
    const inserted: FoodLogRecord[] = [];

    for (const entry of toSave) {
      try {
        const result = await submitLogFood({
          foodName: entry.item.food_name,
          weight: entry.item.weight,
          match: entry.item.match,
          imageUrl: imagePublicUrl,
        });
        if (result.queued) {
          toast.success("Queued for sync when back online");
        } else if (result.data) {
          inserted.push(result.data as FoodLogRecord);
          savedIndices.push(entry.index);
          bumpPortionMemory(entry.item.food_name, entry.item.weight);
        }
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to save all draft entries.",
        );
        toast.error("Unable to save all entries");
        break;
      }
    }

    if (inserted.length) {
      setDailyLogs((prev) =>
        [...inserted, ...prev].sort(
          (a, b) =>
            new Date(b.consumed_at).getTime() -
            new Date(a.consumed_at).getTime(),
        ),
      );
    }

    if (savedIndices.length) {
      setDraft((prev) => prev.filter((_, idx) => !savedIndices.includes(idx)));
    }

    setIsConfirmingAll(false);
  };

  const handleConfirm = async (index: number) => {
    const item = draft[index];
    if (!item) return;
    setError(null);
    setLoggingIndex(index);

    try {
      const result = await submitLogFood({
        foodName: item.food_name,
        weight: item.weight,
        match: item.match,
        imageUrl: imagePublicUrl,
      });
      if (result.queued) {
        toast.success("Offline — queued for sync once you reconnect");
      } else if (result.data) {
        setDailyLogs((prev) => [result.data as FoodLogRecord, ...prev]);
        bumpPortionMemory(item.food_name, item.weight);
        toast.success("Food log saved");
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to save your log entry.",
      );
      toast.error("Unable to save your log entry");
    } finally {
      setLoggingIndex(null);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickName.trim() || quickCalories === null) {
      setError("Enter a name and calories to quick add.");
      return;
    }

    setIsQuickSaving(true);
    setError(null);
    try {
      const result = await submitLogFood({
        foodName: quickName.trim(),
        weight: 1,
        manualMacros: {
          calories: quickCalories,
          protein: quickProtein ?? null,
          carbs: quickCarbs ?? null,
          fat: quickFat ?? null,
        },
      });
      if (result.queued) {
        toast.success("Quick add queued for sync when back online");
      } else if (result.data) {
        setDailyLogs((prev) => [result.data as FoodLogRecord, ...prev]);
        setQuickName("");
        setQuickCalories(null);
        setQuickProtein(null);
        setQuickCarbs(null);
        setQuickFat(null);
        toast.success("Entry added");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to quick add.");
      toast.error("Unable to quick add");
    } finally {
      setIsQuickSaving(false);
    }
  };

  const handleCopyYesterday = async () => {
    setIsCopyingDay(true);
    setError(null);
    const source = new Date(selectedDateObj);
    source.setDate(source.getDate() - 1);
    const sourceDate = formatDateParam(source);
    try {
      const inserted = (await copyDay(sourceDate)) as FoodLogRecord[];
      if (selectedDate === todayKey) {
        setDailyLogs((prev) =>
          [...inserted, ...prev].sort(
            (a, b) =>
              new Date(b.consumed_at).getTime() -
              new Date(a.consumed_at).getTime(),
          ),
        );
      }
      inserted.forEach((log) => bumpPortionMemory(log.food_name, log.weight_g));
      toast.success(`Copied ${inserted.length} items from yesterday`);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to copy yesterday's logs.",
      );
      toast.error("Unable to copy yesterday");
    } finally {
      setIsCopyingDay(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) {
      setError("Select a template to load.");
      return;
    }
    setIsApplyingTemplate(true);
    setError(null);
    try {
      const inserted = await applyMealTemplate(selectedTemplateId, templateScale);
      setDailyLogs((prev) => {
        const combined = [...(inserted as FoodLogRecord[]), ...prev];
        return combined.sort(
          (a, b) => new Date(b.consumed_at).getTime() - new Date(a.consumed_at).getTime(),
        );
      });
      (inserted as FoodLogRecord[]).forEach((log) => bumpPortionMemory(log.food_name, log.weight_g));
      toast.success("Template applied");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to apply template.");
      toast.error("Unable to apply template");
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!draft.length) {
      setError("Generate a draft first to save it as a template.");
      return;
    }
    const name = templateName.trim() || `Meal ${new Date().toLocaleDateString()}`;
    setIsSavingTemplate(true);
    setError(null);
    try {
      const items: MealTemplateItem[] = draft.map((item) => {
        const macros = adjustedMacros(item.match, item.weight) ?? {
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
        };
        return {
          food_name: item.food_name,
          weight_g: item.weight,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
        };
      });

      const saved = await saveMealTemplate(name, items);
      const newTemplate: ClientMealTemplate = {
        id: saved.id as string,
        name: saved.name as string,
        items: saved.items as MealTemplateItem[],
      };
      setTemplateList((prev) => [newTemplate, ...prev]);
      setSelectedTemplateId(newTemplate.id);
      setTemplateName("");
      toast.success("Meal saved for quick loading");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save template.");
      toast.error("Unable to save template");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setTemplateBeingDeleted(templateId);
    setError(null);
    try {
      await deleteMealTemplate(templateId);
      setTemplateList((prev) => {
        const next = prev.filter((template) => template.id !== templateId);
        if (selectedTemplateId === templateId) {
          setSelectedTemplateId(next[0]?.id ?? null);
        }
        return next;
      });
      toast.success("Template deleted");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to delete template.");
      toast.error("Unable to delete template");
    } finally {
      setTemplateBeingDeleted(null);
    }
  };

  const loadRecentFoodsList = async () => {
    if (recentFoods.length || isLoadingRecentFoods) return;
    setIsLoadingRecentFoods(true);
    try {
      const recents = await getRecentFoods();
      setRecentFoods(recents);
    } catch (err) {
      console.error(err);
      toast.error("Unable to load recent foods");
    } finally {
      setIsLoadingRecentFoods(false);
    }
  };

  const beginEditLog = (log: FoodLogRecord) => {
    setEditingLogId(log.id);
    setEditForm({
      food_name: log.food_name,
      weight_g: log.weight_g,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    });
  };

  const openFlagModal = (log: FoodLogRecord) => {
    setFlaggingLog(log);
    setFlagForm({
      food_name: log.food_name,
      weight_g: log.weight_g,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    });
    setFlagNotes("");
  };

  const saveLogEdits = async () => {
    if (!editingLogId) return;
    try {
      await updateFoodLog(editingLogId, {
        food_name: editForm.food_name,
        weight_g: editForm.weight_g,
        calories: editForm.calories ?? null,
        protein: editForm.protein ?? null,
        carbs: editForm.carbs ?? null,
        fat: editForm.fat ?? null,
      });

      setDailyLogs((prev) =>
        prev.map((log) =>
          log.id === editingLogId
            ? {
                ...log,
                food_name: editForm.food_name ?? log.food_name,
                weight_g: editForm.weight_g ?? log.weight_g,
                calories: editForm.calories ?? log.calories,
                protein: editForm.protein ?? log.protein,
                carbs: editForm.carbs ?? log.carbs,
                fat: editForm.fat ?? log.fat,
              }
            : log,
        ),
      );
      setEditingLogId(null);
      toast.success("Entry updated");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to update this entry.",
      );
      toast.error("Unable to update entry");
    }
  };

  const submitFlaggedLog = async () => {
    if (!flaggingLog) return;
    setIsFlagging(true);
    try {
      await reportLogIssue(flaggingLog.id, {
        corrected_food_name: flagForm.food_name,
        corrected_weight_g: flagForm.weight_g ?? null,
        corrected_calories: flagForm.calories ?? null,
        corrected_protein: flagForm.protein ?? null,
        corrected_carbs: flagForm.carbs ?? null,
        corrected_fat: flagForm.fat ?? null,
        notes: flagNotes,
      });
      toast.success("Thanks! Added to the training dataset.");
      setFlaggingLog(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to submit report.");
      toast.error("Unable to submit report");
    } finally {
      setIsFlagging(false);
    }
  };

  const removeLog = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteFoodLog(id);
      setDailyLogs((prev) => prev.filter((log) => log.id !== id));
      toast.success("Entry deleted");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to delete entry.");
      toast.error("Unable to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await upsertUserProfile({
        height: profileForm.height,
        weight: profileForm.weight,
        age: profileForm.age,
        activityLevel: profileForm.activityLevel,
        goalType: profileForm.goalType,
        macroSplit: profileForm.macroSplit,
      });
      toast.success("Goals updated");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save profile.");
      toast.error("Unable to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const todayLabel = useMemo(() => {
    return selectedDateObj.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [selectedDateObj]);

  const draftReviewProps = {
    confidenceLabel,
    draft,
    editingWeightIndex,
    isConfirmingAll,
    isImageUploading,
    loggingIndex,
    onApplyMatch: (index: number, match: MacroMatch) =>
      setDraft((prev) => prev.map((item, idx) => (idx === index ? { ...item, match } : item))),
    onConfirm: handleConfirm,
    onConfirmAll: handleConfirmAll,
    onManualSearch: openManualSearch,
    onSaveTemplate: handleSaveTemplate,
    onTemplateNameChange: setTemplateName,
    onToggleWeightEdit: (index: number) => setEditingWeightIndex(editingWeightIndex === index ? null : index),
    onUpdateWeight: updateWeight,
    templateName,
    isSavingTemplate,
  };

  return (
    <AppErrorBoundary>
      <main className="space-y-8">
        {showDraftModal && draft.length ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-5xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-wide text-emerald-200">Is this correct?</p>
                  <p className="text-base text-white/70">
                    Review the AI draft, adjust weights, or run manual search before saving.
                  </p>
                </div>
                <button
                  className="pill bg-white/10 text-white hover:bg-white/20"
                  onClick={() => setShowDraftModal(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                <ComponentErrorBoundary>
                  <DraftReview {...draftReviewProps} />
                </ComponentErrorBoundary>
              </div>
            </div>
          </div>
        ) : null}
        <header className="card flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="pill border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                Phase 2 – Tracker Mode
              </div>
              <div className="pill bg-white/5 text-white/70">
                Gemini + Supabase + pgvector
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/70">
              <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-100">
                🔥 {streak} day streak
              </div>
              {installPrompt ? (
                <button
                  className="btn bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={handleInstallClick}
                  type="button"
                >
                  Install App
                </button>
              ) : null}
              <a
                className="btn bg-white/10 text-white hover:bg-white/20"
                href="/stats"
              >
                Stats
              </a>
              <a
                className="btn bg-white/10 text-white hover:bg-white/20"
                href="/settings"
              >
                Settings
              </a>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Signed in
                </p>
                <p className="font-medium text-white">
                  {userEmail ?? "Authenticated"}
                </p>
              </div>
              <form action={signOutAction}>
                <button className="btn bg-white/10 text-white hover:bg-white/20" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold text-white">
              Snap → Verify → Log (Trust-but-Verify)
            </h1>
            <p className="max-w-3xl text-lg text-white/70">
              Upload a meal photo or quick-add calories. We calculate goals from your profile and keep you on track with streaks, targets, and edits.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            <span className="pill">Optimistic UI</span>
            <span className="pill">Manual override</span>
            <span className="pill">Progress rings</span>
            <span className="pill">Weekly trends</span>
          </div>
        </header>

      <section className="card grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Target
          </p>
          <h2 className="text-xl font-semibold text-white">
            Personalize your calorie + protein goals
          </h2>
          <p className="text-sm text-white/70">
            We use Mifflin-St Jeor (assumes male constant) with your activity level and goal to calculate daily calorie and protein targets. Macro split is stored for future breakdowns.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-white/70">
              <span>Height (cm)</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                type="number"
                min={100}
                value={profileForm.height}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, height: Number(e.target.value) }))
                }
              />
            </label>
            <label className="space-y-1 text-sm text-white/70">
              <span>Weight (kg)</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                type="number"
                min={30}
                value={profileForm.weight}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, weight: Number(e.target.value) }))
                }
              />
            </label>
            <label className="space-y-1 text-sm text-white/70">
              <span>Age</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                type="number"
                min={10}
                value={profileForm.age}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, age: Number(e.target.value) }))
                }
              />
            </label>
            <label className="space-y-1 text-sm text-white/70">
              <span>Activity level</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                value={profileForm.activityLevel}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, activityLevel: e.target.value }))
                }
              >
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="very_active">Very Active</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-white/70">
              <span>Goal</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                value={profileForm.goalType}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, goalType: e.target.value }))
                }
              >
                <option value="lose">Lose</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Gain</option>
              </select>
            </label>
            <div className="space-y-2">
              <p className="text-sm text-white/70">Macro split (%)</p>
              <div className="grid grid-cols-3 gap-2">
                {(["protein", "carbs", "fat"] as const).map((macro) => (
                  <label className="space-y-1 text-xs text-white/70" key={macro}>
                    <span className="capitalize">{macro}</span>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                      type="number"
                      min={0}
                      max={100}
                      value={profileForm.macroSplit[macro] ?? 0}
                      onChange={(e) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          macroSplit: { ...prev.macroSplit, [macro]: Number(e.target.value) },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button className="btn" disabled={savingProfile} onClick={saveProfile} type="button">
            {savingProfile ? "Saving..." : "Save goals"}
          </button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-sm uppercase tracking-wide text-emerald-200">Today</p>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <div
              aria-label="Calorie progress"
              className="grid h-32 w-32 place-items-center rounded-full bg-white/5 text-center text-white"
              style={buildRingStyle(dailyTotals.calories / (calorieTarget || 1), dailyTotals.calories > calorieTarget)}
            >
              <div className="flex flex-col text-sm">
                <span className="text-xs text-white/70">Calories</span>
                <span className="text-lg font-semibold text-white">
                  {formatNumber(dailyTotals.calories, 0)} / {calorieTarget}
                </span>
              </div>
            </div>
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              {[
                {
                  key: "protein",
                  label: "Protein",
                  value: dailyTotals.protein,
                  target: macroTargets.protein || proteinTarget,
                  color: "#38bdf8",
                  suffix: "g",
                },
                {
                  key: "carbs",
                  label: "Carbs",
                  value: dailyTotals.carbs,
                  target: macroTargets.carbs || 1,
                  color: "#fbbf24",
                  suffix: "g",
                },
                {
                  key: "fat",
                  label: "Fat",
                  value: dailyTotals.fat,
                  target: macroTargets.fat || 1,
                  color: "#f472b6",
                  suffix: "g",
                },
              ].map((macro) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
                  key={macro.key}
                >
                  <div
                    aria-label={`${macro.label} progress`}
                    className="grid h-16 w-16 place-items-center rounded-full text-xs"
                    style={buildDonutStyle(
                      macro.value / (macro.target || 1),
                      macro.color,
                    )}
                  >
                    <div className="text-center text-[11px] leading-tight text-white">
                      <div className="font-semibold">{formatNumber(macro.value, 0)}{macro.suffix}</div>
                      <div className="text-white/60">/ {formatNumber(macro.target, 0)}{macro.suffix}</div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/60">
                      {macro.label}
                    </p>
                    <p className="text-white/80">
                      {formatNumber(macro.value, 1)} / {formatNumber(macro.target, 0)}{macro.suffix}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-white/60">
                  Water
                </p>
                <span className="pill bg-white/10 text-xs text-white/60">
                  Goal 2000ml
                </span>
              </div>
              <p className="text-lg font-semibold text-white">
                {waterIntake} ml
              </p>
              <button
                className="btn w-full sm:w-auto"
                disabled={isLoggingWater}
                onClick={() => void handleAddWater(250)}
                type="button"
              >
                {isLoggingWater ? "Saving..." : "+ 250ml"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-emerald-200">
                Capture
              </p>
              <h2 className="text-xl font-semibold text-white">
                Upload a meal photo or quick add
              </h2>
              <p className="text-sm text-white/60">
                We immediately render the image while the backend runs Gemini +
                Supabase searches in parallel, or you can bypass AI with manual
                text entry.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 text-sm text-white">
              <button
                className={`rounded-full px-3 py-1 ${captureMode === "photo" ? "bg-emerald-500 text-white" : ""}`}
                onClick={() => setCaptureMode("photo")}
                type="button"
              >
                Photo
              </button>
              <button
                className={`rounded-full px-3 py-1 ${captureMode === "manual" ? "bg-emerald-500 text-white" : ""}`}
                onClick={() => setCaptureMode("manual")}
                type="button"
              >
                Text / Manual
              </button>
            </div>
          </div>

          {captureMode === "photo" ? (
            <CameraCapture
              captureMode={captureMode}
              filePreview={filePreview}
              isApplyingTemplate={isApplyingTemplate}
              isImageUploading={isImageUploading}
              isUploading={isUploading}
              onApplyTemplate={handleApplyTemplate}
              onFileChange={(file) => void onFileChange(file)}
              onOpenTemplateManager={() => setShowTemplateManager(true)}
              onTemplateChange={(value) => setSelectedTemplateId(value)}
              onTemplateScaleChange={(value) => setTemplateScale(value)}
              selectedTemplateId={selectedTemplateId}
              templateList={templateList}
              templateScale={templateScale}
            />
          ) : (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
              <p className="text-sm text-white/70">
                Bypass the camera and log a quick item. Only the calories are required.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-white/70">
                  <span>Item name</span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                    placeholder="Oreo cookie"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm text-white/70">
                  <span>Calories</span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                    type="number"
                    min={0}
                    value={quickCalories ?? ""}
                    onChange={(e) => setQuickCalories(e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label className="space-y-1 text-sm text-white/70">
                  <span>Protein (g)</span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                    type="number"
                    min={0}
                    value={quickProtein ?? ""}
                    onChange={(e) => setQuickProtein(e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label className="space-y-1 text-sm text-white/70">
                  <span>Carbs (g)</span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                    type="number"
                    min={0}
                    value={quickCarbs ?? ""}
                    onChange={(e) => setQuickCarbs(e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
                <label className="space-y-1 text-sm text-white/70">
                  <span>Fat (g)</span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                    type="number"
                    min={0}
                    value={quickFat ?? ""}
                    onChange={(e) => setQuickFat(e.target.value ? Number(e.target.value) : null)}
                  />
                </label>
              </div>
              <button className="btn w-full sm:w-auto" disabled={isQuickSaving} onClick={handleQuickAdd} type="button">
                {isQuickSaving ? "Adding..." : "Quick add entry"}
              </button>
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Scan a barcode</p>
                    <p className="text-xs text-white/60">html5-qrcode + OpenFoodFacts lookup.</p>
                  </div>
                  <button
                    className="btn bg-white/10 text-white hover:bg-white/20"
                    onClick={toggleScanner}
                    type="button"
                  >
                    {showScanner ? "Stop scanning" : "Start scanner"}
                  </button>
                </div>
                {showScanner ? (
                  <div className="mt-3 space-y-2">
                    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      <div className="aspect-video" id="barcode-reader">
                        {!isScanningBarcode && !hasScannerInstance ? (
                          <p className="p-4 text-center text-xs text-white/60">Initializing camera...</p>
                        ) : null}
                      </div>
                    </div>
                    {scannerError ? (
                      <p className="text-xs text-red-300">{scannerError}</p>
                    ) : (
                      <p className="text-xs text-white/60">
                        Aim at the barcode. We will prefill macros from the public database.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-white/60">
                    We will auto-open the manual override panel with the barcode result.
                  </p>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          )}
          {analysisNotice ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-50">
              {analysisNotice}
            </div>
          ) : null}
        </div>

        <ComponentErrorBoundary>
          <DraftReview {...draftReviewProps} />
        </ComponentErrorBoundary>
      </section>

      <section className="card grid gap-6 lg:grid-cols-3">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Prompting</h3>
          <p className="text-sm text-white/60">
            The API uses a constrained JSON prompt to Gemini 1.5 Flash to avoid
            hallucinated nutrition values. Only names + quantities are returned.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Vector search</h3>
          <p className="text-sm text-white/60">
            We embed the Gemini search term locally with transformers.js using{" "}
            <code className="rounded bg-white/10 px-1 py-0.5">
              Xenova/all-MiniLM-L6-v2
            </code>{" "}
            to match the pgvector data stored in Supabase.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Supabase policies</h3>
          <p className="text-sm text-white/60">
            USDA data stays public (select only), while user food logs are RLS
            protected. The code anticipates the SQL policies defined in the
            blueprint.
          </p>
        </div>
      </section>

      <DailyLogList
        dailyLogs={dailyLogs}
        dailyTotals={dailyTotals}
        deletingId={deletingId}
        editForm={editForm}
        editingLogId={editingLogId}
        isCopyingDay={isCopyingDay}
        onBeginEdit={beginEditLog}
        onCancelEdit={() => setEditingLogId(null)}
        onCopyYesterday={handleCopyYesterday}
        onDeleteLog={removeLog}
        onEditField={(field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))}
        onFlagLog={openFlagModal}
        onNavigateToDate={navigateToDate}
        onSaveEdits={saveLogEdits}
        onShiftDate={shiftDate}
        selectedDate={selectedDate}
        todayLabel={todayLabel}
      />

      {showTemplateManager && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-emerald-200">
                  Manage meal templates
                </p>
                <h4 className="text-lg font-semibold text-white">Delete or switch templates</h4>
              </div>
              <button
                className="text-white/70 hover:text-white"
                onClick={() => setShowTemplateManager(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {templateList.length === 0 ? (
                <p className="text-sm text-white/60">
                  No templates saved yet. Generate a draft and save it to manage here.
                </p>
              ) : (
                templateList.map((template) => (
                  <div
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3"
                    key={template.id}
                  >
                    <div>
                      <p className="text-white">{template.name}</p>
                      <p className="text-xs text-white/60">
                        {Array.isArray(template.items) ? template.items.length : 0} items
                      </p>
                    </div>
                    <button
                      className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
                      disabled={templateBeingDeleted === template.id}
                      onClick={() => handleDeleteTemplate(template.id)}
                      type="button"
                    >
                      {templateBeingDeleted === template.id ? "Deleting..." : "🗑️ Delete"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {flaggingLog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-emerald-200">
                  Flag for training
                </p>
                <h4 className="text-lg font-semibold text-white">Report an incorrect AI guess</h4>
                <p className="text-xs text-white/60">We will store this in the training_dataset table.</p>
              </div>
              <button
                className="text-white/70 hover:text-white"
                onClick={() => setFlaggingLog(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-white/70 sm:col-span-2">
                <span>Food name</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={flagForm.food_name ?? ""}
                  onChange={(e) => setFlagForm((prev) => ({ ...prev, food_name: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm text-white/70">
                <span>Weight (g)</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  type="number"
                  value={flagForm.weight_g ?? ""}
                  onChange={(e) =>
                    setFlagForm((prev) => ({
                      ...prev,
                      weight_g: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-white/70">
                <span>Calories</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  type="number"
                  value={flagForm.calories ?? ""}
                  onChange={(e) =>
                    setFlagForm((prev) => ({
                      ...prev,
                      calories: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-white/70">
                <span>Protein (g)</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  type="number"
                  value={flagForm.protein ?? ""}
                  onChange={(e) =>
                    setFlagForm((prev) => ({
                      ...prev,
                      protein: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-white/70">
                <span>Carbs (g)</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  type="number"
                  value={flagForm.carbs ?? ""}
                  onChange={(e) =>
                    setFlagForm((prev) => ({
                      ...prev,
                      carbs: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-white/70">
                <span>Fat (g)</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  type="number"
                  value={flagForm.fat ?? ""}
                  onChange={(e) =>
                    setFlagForm((prev) => ({
                      ...prev,
                      fat: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-white/70 sm:col-span-2">
                <span>Notes</span>
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button className="btn" disabled={isFlagging} onClick={submitFlaggedLog} type="button">
                {isFlagging ? "Sending..." : "Submit report"}
              </button>
              <button
                className="btn bg-white/10 text-white hover:bg-white/20"
                onClick={() => setFlaggingLog(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ManualSearchModal
        isLoadingRecentFoods={isLoadingRecentFoods}
        isSearching={isSearching}
        onChangeQuery={setManualQuery}
        onClose={() => setManualOpenIndex(null)}
        onSearch={runManualSearch}
        onSelect={applyManualResult}
        openIndex={manualOpenIndex}
        query={manualQuery}
        recentFoods={recentFoods}
        results={manualResults}
      />
      </main>
    </AppErrorBoundary>
  );
}
