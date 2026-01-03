"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { logFood, manualSearch, signOutAction } from "./actions";
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

export default function HomeClient({
  initialLogs,
  userEmail,
  selectedDate,
}: {
  initialLogs: FoodLogRecord[];
  userEmail: string | null | undefined;
  selectedDate: string;
}) {
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
    setError(null);
    setIsUploading(true);
    setIsImageUploading(true);
    setImagePublicUrl(null);
    setDraft([]);

    const reader = new FileReader();
    reader.onloadend = () => setFilePreview(reader.result as string);
    reader.readAsDataURL(file);

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
        file.name.split(".").pop() || file.type.split("/")[1] || "jpg";
      const path = `uploads/${new Date()
        .toISOString()
        .slice(0, 10)}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseBrowser.storage
        .from(bucket)
        .upload(path, file, {
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
      formData.append("file", file);

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

  const todayLabel = useMemo(() => {
    return selectedDateObj.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [selectedDateObj]);

  return (
    <main className="space-y-8">
      <header className="card flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="pill border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
              Phase 1 – Visual RAG Loop
            </div>
            <div className="pill bg-white/5 text-white/70">
              Gemini + Supabase + pgvector
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
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
            Upload a meal photo and we will detect the food, search the USDA
            library, and draft a log for you to confirm. This demo follows the
            blueprint&apos;s Visual RAG architecture: Gemini for perception,
            transformers.js for embeddings, and Supabase pgvector for the truth.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-white/60">
          <span className="pill">Optimistic UI</span>
          <span className="pill">JSON-only AI prompt</span>
          <span className="pill">Zero infra cost</span>
          <span className="pill">Manual override</span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-emerald-200">
                Capture
              </p>
              <h2 className="text-xl font-semibold text-white">
                Upload a meal photo
              </h2>
              <p className="text-sm text-white/60">
                We immediately render the image while the backend runs Gemini +
                Supabase searches in parallel.
              </p>
            </div>
            <label className="btn cursor-pointer">
              <input
                accept="image/*"
                className="hidden"
                type="file"
                onChange={(event) => onFileChange(event.target.files?.[0])}
              />
              {isUploading ? "Scanning..." : "Take Photo"}
            </label>
          </div>

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
                <div>
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
                </div>
                <div className="flex flex-wrap gap-2 text-white/80">
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
  );
}
