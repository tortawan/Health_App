"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type DraftLog = {
  food_name: string;
  quantity_estimate: string;
  search_term: string;
  match?: {
    description: string;
    kcal_100g: number | null;
    protein_100g: number | null;
    carbs_100g: number | null;
    fat_100g: number | null;
    distance: number | null;
  };
};

type AnalyzeResponse = {
  draft: DraftLog[];
  imagePath?: string;
};

export default function Home() {
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draft, setDraft] = useState<DraftLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const confidenceLabel = useMemo(() => {
    if (!draft[0]?.match?.distance && draft[0]?.match?.distance !== 0) {
      return "Pending";
    }
    const distance = draft[0].match?.distance ?? 1;
    if (distance < 0.15) return "High confidence";
    if (distance < 0.3) return "Medium confidence";
    return "Low confidence - please verify manually";
  }, [draft]);

  const onFileChange = async (file?: File) => {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    setDraft([]);

    const reader = new FileReader();
    reader.onloadend = () => setFilePreview(reader.result as string);
    reader.readAsDataURL(file);

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

      const payload: AnalyzeResponse = await response.json();
      setDraft(payload.draft);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected issue analyzing the image.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="space-y-8">
      <header className="card flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="pill border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            Phase 1 – Visual RAG Loop
          </div>
          <div className="pill bg-white/5 text-white/70">
            Gemini + Supabase + pgvector
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
                  <p>Scanning with Gemini...</p>
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
              {draft.map((item, index) => (
                <div
                  className="rounded-xl border border-white/10 bg-slate-900/60 p-4"
                  key={`${item.food_name}-${index}`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        {item.food_name}
                      </h3>
                      <span className="pill bg-white/10 text-white/70">
                        {item.quantity_estimate}
                      </span>
                    </div>
                    <p className="text-sm text-white/60">
                      Search term: {item.search_term}
                    </p>
                    {item.match ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/80">
                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-xs uppercase text-white/50">
                            Match
                          </p>
                          <p>{item.match.description}</p>
                        </div>
                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-xs uppercase text-white/50">
                            Macros / 100g
                          </p>
                          <p className="flex flex-wrap gap-2">
                            <span>Kcal {item.match.kcal_100g ?? "?"}</span>
                            <span>Protein {item.match.protein_100g ?? "?"}</span>
                            <span>Carbs {item.match.carbs_100g ?? "?"}</span>
                            <span>Fat {item.match.fat_100g ?? "?"}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-100/80">
                        No confident match found. Tap manual search in the app.
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <button className="btn">Confirm</button>
                    <button className="btn bg-white/10 text-white hover:bg-white/20">
                      Adjust weight
                    </button>
                    <button className="btn bg-white/10 text-white hover:bg-white/20">
                      Manual search
                    </button>
                  </div>
                </div>
              ))}
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
    </main>
  );
}
