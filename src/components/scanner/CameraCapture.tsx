"use client";

import Image from "next/image";
import { MealTemplate } from "@/types/food";

type Props = {
  captureMode: "photo" | "manual";
  isUploading: boolean;
  isImageUploading: boolean;
  filePreview: string | null;
  templateList: MealTemplate[];
  selectedTemplateId: string | null;
  templateScale: number;
  onTemplateChange: (templateId: string | null) => void;
  onTemplateScaleChange: (value: number) => void;
  onApplyTemplate: () => void;
  onOpenTemplateManager: () => void;
  isApplyingTemplate: boolean;
  onFileChange: (file?: File) => void;
  analysisMessage?: string | null;
  queuedCount?: number;
  queueNotice?: string | null;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  uploadInputId?: string;
  onClose?: () => void;
};

export function CameraCapture({
  captureMode,
  isUploading,
  isImageUploading,
  filePreview,
  templateList,
  selectedTemplateId,
  templateScale,
  onTemplateChange,
  onTemplateScaleChange,
  onApplyTemplate,
  onOpenTemplateManager,
  isApplyingTemplate,
  onFileChange,
  analysisMessage,
  queuedCount = 0,
  queueNotice,
  fileInputRef,
  uploadInputId = "photo-upload",
  onClose,
}: Props) {
  if (captureMode !== "photo") return null;

  return (
    <>
      {/* Header with close button */}
      {onClose && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Scan Food</h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            aria-label="Close scanner"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Only show Quick load section if templates exist */}
      {templateList.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm uppercase tracking-wide text-emerald-200">Quick load</p>
              <p className="text-xs text-white/60">Drop in a saved meal template to insert multiple entries.</p>
            </div>
            <span className="pill bg-white/10 text-white/60">{templateList.length} saved</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="min-w-[200px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              value={selectedTemplateId ?? ""}
              onChange={(event) => onTemplateChange(event.target.value || null)}
            >
              <option value="">Select a template</option>
              {templateList.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <span>Scale</span>
              <input
                className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                min={0.1}
                step={0.1}
                type="number"
                value={templateScale}
                onChange={(e) => onTemplateScaleChange(e.target.value ? Number(e.target.value) : 1)}
              />
            </label>
            <button className="btn" disabled={!selectedTemplateId || isApplyingTemplate} onClick={onApplyTemplate} type="button">
              {isApplyingTemplate ? "Loading..." : "Quick load meal"}
            </button>
            <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={onOpenTemplateManager} type="button">
              Manage templates
            </button>
          </div>
        </div>
      )}

      <input
        accept="image/*"
        capture="environment"
        className="hidden"
        id={uploadInputId}
        ref={fileInputRef}
        type="file"
        onChange={(event) => onFileChange(event.target.files?.[0])}
      />
      <label className="btn cursor-pointer" htmlFor={uploadInputId}>
        {isUploading ? "Scanning..." : "Take Photo"}
      </label>
      {queueNotice && !isUploading && (
        <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm text-blue-100">
          {queueNotice}
        </div>
      )}
      {queuedCount > 0 && !isUploading && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
          {queuedCount} photo{queuedCount === 1 ? "" : "s"} queued for upload.
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
        {filePreview ? (
          <Image
            alt="Uploaded meal preview"
            className={`h-80 w-full object-cover transition ${isUploading ? "blur-sm" : ""}`}
            height={320}
            src={filePreview}
            width={640}
          />
        ) : (
          <div className="flex h-80 items-center justify-center text-white/40">Upload a photo to start the Visual RAG flow.</div>
        )}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="flex w-full max-w-lg flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-4 text-sm text-white/80 shadow-lg">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <span className="h-3 w-3 animate-ping rounded-full bg-emerald-400" />
                Scanning...
              </div>
              <div className="grid gap-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                <div className="h-24 animate-pulse rounded-lg bg-white/5" />
              </div>
              <p className="text-xs text-white/60">
                Captured image locked in — we are uploading it and running Gemini + Supabase matches.
              </p>
              <p className="text-xs text-white/60">
                {isImageUploading ? "Uploading to Supabase Storage..." : "Matching against USDA vectors..."}
              </p>
            </div>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-1 bg-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.8)] scan-line" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/40 border-t-emerald-300" />
              </div>
            </div>
          </div>
        )}
      </div>
      {analysisMessage && !isUploading && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {analysisMessage}
        </div>
      )}
      <style jsx>{`
        @keyframes scan {
          0% {
            transform: translateY(0%);
          }
          50% {
            transform: translateY(320px);
          }
          100% {
            transform: translateY(0%);
          }
        }

        .scan-line {
          animation: scan 2.2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
