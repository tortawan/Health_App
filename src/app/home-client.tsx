"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  deleteFoodLog,
  logFood,
  manualSearch,
  signOutAction,
  updateFoodLog,
  upsertUserProfile,
} from "./actions";
import { supabaseBrowser } from "@/lib/supabase";

type MacroMatch = {
  description: string;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  similarity?: number | null;
};

type DraftLog = {
  food_name: string;
  quantity_estimate: string;
  search_term: string;
  match?: MacroMatch;
  weight: number;
};

type FoodLogRecord = {
  id: string;
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  consumed_at: string;
  image_path?: string | null;
};

type UserProfile = {
  user_id: string;
  height: number | null;
  weight: number | null;
  age: number | null;
  activity_level: string | null;
  goal_type: string | null;
  macro_split: Record<string, unknown> | null;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
} | null;

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalType = "lose" | "maintain" | "gain";
type ProfileFormState = {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  macroSplit: Record<string, number>;
};

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

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toFixed(digits);
}

function adjustedMacros(match: MacroMatch | undefined, weight: number) {
  if (!match) return null;
  const factor = weight / 100;
  const calc = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value) * factor;

  return {
    calories: calc(match.kcal_100g),
    protein: calc(match.protein_100g),
    carbs: calc(match.carbs_100g),
    fat: calc(match.fat_100g),
  };
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

export default function HomeClient({
  initialLogs,
  userEmail,
  selectedDate,
  profile,
  streak,
}: {
  initialLogs: FoodLogRecord[];
  userEmail: string | null | undefined;
  selectedDate: string;
  profile: UserProfile;
  streak: number;
}) {
  const [captureMode, setCaptureMode] = useState<"photo" | "manual">("photo");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    height: profile?.height ?? 170,
    weight: profile?.weight ?? 70,
    age: profile?.age ?? 30,
    activityLevel: (profile?.activity_level as ActivityLevel | undefined) ?? "light",
    goalType: (profile?.goal_type as GoalType | undefined) ?? "maintain",
    macroSplit: (profile?.macro_split as Record<string, number> | null) ?? {
      protein: 30,
      carbs: 40,
      fat: 30,
    },
  });
  const router = useRouter();

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
        process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "food-photos";
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
      const formData = new FormData();
      formData.append("file", processed);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Unable to analyze image. Please try again.");
      }

      const payload = (await response.json()) as {
        draft: DraftLog[];
        imagePath?: string;
      };

      const enhanced = payload.draft.map((item) => ({
        ...item,
        weight: extractWeight(item.quantity_estimate),
      }));
      setDraft(enhanced);
      if (payload.imagePath) setFilePreview(payload.imagePath);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected issue analyzing the image.",
      );
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
        idx === manualOpenIndex ? { ...item, match: result } : item,
      ),
    );
    setManualOpenIndex(null);
  };

  const handleConfirm = async (index: number) => {
    const item = draft[index];
    if (!item) return;
    setError(null);
    setLoggingIndex(index);

    try {
      const inserted = await logFood({
        foodName: item.food_name,
        weight: item.weight,
        match: item.match,
        imageUrl: imagePublicUrl,
      });
      setDailyLogs((prev) => [inserted as FoodLogRecord, ...prev]);
      toast.success("Food log saved");
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
      const inserted = await logFood({
        foodName: quickName.trim(),
        weight: 1,
        manualMacros: {
          calories: quickCalories,
          protein: quickProtein ?? null,
          carbs: quickCarbs ?? null,
          fat: quickFat ?? null,
        },
      });
      setDailyLogs((prev) => [inserted as FoodLogRecord, ...prev]);
      setQuickName("");
      setQuickCalories(null);
      setQuickProtein(null);
      setQuickCarbs(null);
      setQuickFat(null);
      toast.success("Entry added");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to quick add.");
      toast.error("Unable to quick add");
    } finally {
      setIsQuickSaving(false);
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

  return (
    <AppErrorBoundary>
      <main className="space-y-8">
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
            <a
              className="btn bg-white/10 text-white hover:bg-white/20"
              href="/stats"
            >
              Stats
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
          <div className="mt-4 flex items-center gap-6">
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
            <div className="space-y-2 text-sm text-white/70">
              <p>
                Protein: <span className="text-white">{formatNumber(dailyTotals.protein)}g</span>{" "}
                <span className="text-white/60">/ {proteinTarget}g</span>
              </p>
              <p>
                Carbs: <span className="text-white">{formatNumber(dailyTotals.carbs)}g</span>
              </p>
              <p>
                Fat: <span className="text-white">{formatNumber(dailyTotals.fat)}g</span>
              </p>
              <p className="text-emerald-200">Stay green to stay on target.</p>
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
            <>
              <label className="btn cursor-pointer">
                <input
                  accept="image/*"
                  className="hidden"
                  type="file"
                  onChange={(event) => onFileChange(event.target.files?.[0])}
                />
                {isUploading ? "Scanning..." : "Take Photo"}
              </label>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
                {filePreview ? (
                  <Image
                    alt="Uploaded meal preview"
                    className="h-80 w-full object-cover"
                    height={320}
                    src={filePreview}
                    width={640}
                  />
                ) : (
                  <div className="flex h-80 items-center justify-center text-white/40">
                    Upload a photo to start the Visual RAG flow.
                  </div>
                )}
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-sm text-white/80">
                      <span className="h-8 w-8 animate-ping rounded-full bg-emerald-400/60" />
                      <p>
                        {isImageUploading
                          ? "Uploading photo to Supabase..."
                          : "Scanning with Gemini..."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
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
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-emerald-200">
                Verification
              </p>
              <h2 className="text-xl font-semibold text-white">
                Draft entries
              </h2>
              <p className="text-sm text-white/60">
                We never auto-save. Confirm or adjust the AI guess before
                logging.
              </p>
            </div>
            <span className="pill bg-emerald-500/20 text-emerald-100">
              {confidenceLabel}
            </span>
          </div>

          {!draft.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
              No draft yet. Upload an image to generate a structured suggestion.
            </div>
          ) : (
            <div className="space-y-3">
              {draft.map((item, index) => {
                const adjusted = adjustedMacros(item.match, item.weight);
                return (
                  <div
                    className="rounded-xl border border-white/10 bg-slate-900/60 p-4"
                    key={`${item.food_name}-${index}`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold text-white">
                          {item.food_name}
                        </h3>
                        <button
                          className="pill bg-white/10 text-white/70 hover:bg-white/20"
                          onClick={() =>
                            setEditingWeightIndex(
                              editingWeightIndex === index ? null : index,
                            )
                          }
                          type="button"
                        >
                          {item.quantity_estimate} ({item.weight}g)
                        </button>
                      </div>
                      <p className="text-sm text-white/60">
                        Search term: {item.search_term}
                      </p>
                      {editingWeightIndex === index && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
                          <label className="text-white/60" htmlFor={`weight-${index}`}>
                            Adjust weight (g):
                          </label>
                          <input
                            className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white focus:border-emerald-400 focus:outline-none"
                            id={`weight-${index}`}
                            min={1}
                            type="number"
                            value={item.weight}
                            onChange={(e) => updateWeight(index, Number(e.target.value))}
                          />
                          <button
                            className="btn bg-white/10 text-white hover:bg-white/20"
                            type="button"
                            onClick={() => setEditingWeightIndex(null)}
                          >
                            Done
                          </button>
                        </div>
                      )}
                      {item.match ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/80">
                          <div className="rounded-lg bg-white/5 p-2">
                            <p className="text-xs uppercase text-white/50">
                              Match ({formatNumber(item.match.similarity, 2)} similarity)
                            </p>
                            <p>{item.match.description}</p>
                          </div>
                          <div className="rounded-lg bg-white/5 p-2">
                            <p className="text-xs uppercase text-white/50">
                              Macros / 100g
                            </p>
                            <p className="flex flex-wrap gap-2">
                              <span>Kcal {formatNumber(item.match.kcal_100g)}</span>
                              <span>
                                Protein {formatNumber(item.match.protein_100g)}g
                              </span>
                              <span>Carbs {formatNumber(item.match.carbs_100g)}g</span>
                              <span>Fat {formatNumber(item.match.fat_100g)}g</span>
                            </p>
                          </div>
                          <div className="col-span-2 rounded-lg bg-emerald-500/10 p-2">
                            <p className="text-xs uppercase text-emerald-100/70">
                              Adjusted macros ({item.weight}g)
                            </p>
                            {adjusted ? (
                              <p className="flex flex-wrap gap-2 text-emerald-50">
                                <span>
                                  Kcal {formatNumber(adjusted.calories)}
                                </span>
                                <span>
                                  Protein {formatNumber(adjusted.protein)}g
                                </span>
                                <span>Carbs {formatNumber(adjusted.carbs)}g</span>
                                <span>Fat {formatNumber(adjusted.fat)}g</span>
                              </p>
                            ) : (
                              <p className="text-emerald-100/80">
                                Add a manual match to calculate macros.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-100/80">
                          No confident match found. Try manual search to select the right food.
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm">
                      <button
                        className="btn disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          !item.match || loggingIndex === index || isImageUploading
                        }
                        onClick={() => handleConfirm(index)}
                        type="button"
                      >
                        {loggingIndex === index
                          ? "Saving..."
                          : isImageUploading
                            ? "Uploading photo..."
                            : "Confirm"}
                      </button>
                      <button
                        className="btn bg-white/10 text-white hover:bg-white/20"
                        onClick={() =>
                          setEditingWeightIndex(
                            editingWeightIndex === index ? null : index,
                          )
                        }
                        type="button"
                      >
                        Adjust weight
                      </button>
                      <button
                        className="btn bg-white/10 text-white hover:bg-white/20"
                        onClick={() => openManualSearch(index)}
                        type="button"
                      >
                        Manual search
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-emerald-200">
              Daily log
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-white">{todayLabel}</h3>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/70">
                <button
                  aria-label="Previous day"
                  className="rounded px-2 py-1 hover:bg-white/10"
                  onClick={() => shiftDate(-1)}
                  type="button"
                >
                  ←
                </button>
                <input
                  className="rounded bg-transparent px-2 py-1 outline-none"
                  max={new Date().toISOString().slice(0, 10)}
                  type="date"
                  value={selectedDate}
                  onChange={(event) => navigateToDate(event.target.value)}
                />
                <button
                  aria-label="Next day"
                  className="rounded px-2 py-1 hover:bg-white/10"
                  onClick={() => shiftDate(1)}
                  type="button"
                >
                  →
                </button>
              </div>
            </div>
            <p className="text-sm text-white/60">
              Totals are summed from your food_logs entries for the selected date.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-50">
            <p className="font-semibold">Daily Total</p>
            <p className="flex flex-wrap gap-3">
              <span>Kcal {formatNumber(dailyTotals.calories, 0)}</span>
              <span>Protein {formatNumber(dailyTotals.protein)}g</span>
              <span>Carbs {formatNumber(dailyTotals.carbs)}g</span>
              <span>Fat {formatNumber(dailyTotals.fat)}g</span>
            </p>
          </div>
        </div>

        {!dailyLogs.length ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
            No logs yet for today. Confirm a draft entry to see it here.
          </div>
        ) : (
          <div className="space-y-3">
            {dailyLogs.map((log) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm"
                key={log.id}
              >
                <div className="space-y-1">
                  {editingLogId === log.id ? (
                    <div className="grid grid-cols-2 gap-2 text-xs text-white/70 sm:grid-cols-3">
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        value={editForm.food_name ?? ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, food_name: e.target.value }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        type="number"
                        value={editForm.weight_g ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, weight_g: Number(e.target.value) }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        type="number"
                        value={editForm.calories ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, calories: Number(e.target.value) }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        type="number"
                        value={editForm.protein ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, protein: Number(e.target.value) }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        type="number"
                        value={editForm.carbs ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, carbs: Number(e.target.value) }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white"
                        type="number"
                        value={editForm.fat ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, fat: Number(e.target.value) }))
                        }
                      />
                      <div className="col-span-2 flex gap-2 sm:col-span-3">
                        <button className="btn" onClick={saveLogEdits} type="button">
                          Save
                        </button>
                        <button
                          className="btn bg-white/10 text-white hover:bg-white/20"
                          onClick={() => setEditingLogId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-white">
                        {log.food_name}
                      </p>
                      <p className="text-white/60">
                        {log.weight_g}g •{" "}
                        {new Date(log.consumed_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-white/80">
                  <span className="pill bg-white/10">
                    Kcal {formatNumber(log.calories, 0)}
                  </span>
                  <span className="pill bg-white/10">
                    Protein {formatNumber(log.protein)}g
                  </span>
                  <span className="pill bg-white/10">
                    Carbs {formatNumber(log.carbs)}g
                  </span>
                  <span className="pill bg-white/10">
                    Fat {formatNumber(log.fat)}g
                  </span>
                  <button
                    aria-label="Edit entry"
                    className="pill bg-white/10 text-white hover:bg-white/20"
                    onClick={() => beginEditLog(log)}
                    type="button"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    aria-label="Delete entry"
                    className="pill bg-red-500/20 text-red-100 hover:bg-red-500/30"
                    disabled={deletingId === log.id}
                    onClick={() => removeLog(log.id)}
                    type="button"
                  >
                    {deletingId === log.id ? "Deleting..." : "🗑️ Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {manualOpenIndex !== null && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-emerald-200">
                  Manual search
                </p>
                <h4 className="text-lg font-semibold text-white">
                  Override the AI match
                </h4>
              </div>
              <button
                className="text-white/70 hover:text-white"
                onClick={() => setManualOpenIndex(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                placeholder="Search for a food (e.g., grilled chicken)"
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button
                  className="btn"
                  disabled={isSearching}
                  onClick={runManualSearch}
                  type="button"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
                <p className="text-xs text-white/60">
                  Uses the same embedding model + match_foods RPC as the AI path.
                </p>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {!manualResults.length ? (
                  <p className="text-sm text-white/60">
                    No results yet. Enter a query to search.
                  </p>
                ) : (
                  manualResults.map((result, idx) => (
                    <button
                      className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-emerald-400/70"
                      key={`${result.description}-${idx}`}
                      onClick={() => applyManualResult(result)}
                      type="button"
                    >
                      <p className="text-white">{result.description}</p>
                      <p className="text-xs text-white/60">
                        Similarity {formatNumber(result.similarity, 2)}
                      </p>
                      <p className="text-sm text-white/70">
                        Kcal {formatNumber(result.kcal_100g)} • Protein{" "}
                        {formatNumber(result.protein_100g)}g • Carbs{" "}
                        {formatNumber(result.carbs_100g)}g • Fat{" "}
                        {formatNumber(result.fat_100g)}g
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </main>
    </AppErrorBoundary>
  );
}
