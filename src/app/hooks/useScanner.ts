"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { DraftLog, MacroMatch } from "@/types/food";
import { createClient } from "@/lib/supabase-browser";

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- Barcode Scanner Types ---
type Html5QrcodeInstance = {
  start(
    camera: { facingMode: string } | string,
    config: Record<string, unknown>,
    onSuccess: (decodedText: string) => void,
    onError?: (error: unknown) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};

type Html5QrcodeConstructor = new (elementId: string) => Html5QrcodeInstance;

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeConstructor;
  }
}

type UseScannerOptions = {
  onProductLoaded?: (match: MacroMatch) => Promise<void> | void;
  onError?: (message: string) => void;
  onAnalysisStart?: () => void;
  onAnalysisComplete?: (payload: { draft: DraftLog[]; imageUrl: string | null }) => void;
  onAnalysisError?: (message: string) => void;
};

// --- Loader Helper ---
const loadScannerScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Browser required for scanning."));
      return;
    }
    if (window.Html5Qrcode) {
      resolve();
      return;
    }
    const existing = document.getElementById("html5-qrcode-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load scanner script")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = "html5-qrcode-script";
    script.src = "https://unpkg.com/html5-qrcode@2.3.11/html5-qrcode.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load scanner script"));
    document.body.appendChild(script);
  });

export function useScanner(options: UseScannerOptions = {}) {
  const { onProductLoaded, onError, onAnalysisStart, onAnalysisComplete, onAnalysisError } = options;
  const supabase = createClient();

  // --- Shared State ---
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Image Analysis State ---
  const [draft, setDraft] = useState<DraftLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

  // --- Barcode State ---
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [hasScannerInstance, setHasScannerInstance] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  // --- Image Handling Logic ---
  const handleImageUpload = useCallback(async (file: File) => {
    console.log("📸 [DEBUG] handleImageUpload triggered");
    setError(null);
    setAnalysisMessage(null);
    setIsImageUploading(true);
    onAnalysisStart?.();
    
    try {
      // 1. Upload to Supabase Storage
      const fileName = `${generateId()}-${file.name}`;
      
      // ✅ FIX: Use environment variable or default to "food-photos"
      // This ensures consistency with the database audit recommendations.
      const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "food-photos";

      console.log(`📦 [DEBUG] Uploading to Bucket: '${bucketName}'`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

      if (uploadError) {
        console.error("❌ [DEBUG] Upload Error:", uploadError);
        throw uploadError;
      }

      console.log("✅ [DEBUG] Upload Success!", uploadData);

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);
      
      const publicUrl = publicUrlData.publicUrl;
      console.log(`🔗 [DEBUG] Public URL: ${publicUrl}`);
      
      setImagePublicUrl(publicUrl);
      setIsImageUploading(false);

      // 2. Analyze Image
      setIsAnalyzing(true);
      console.log("🧠 [DEBUG] Sending to AI analysis...");
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      
      const data = await response.json();
      console.log("✅ [DEBUG] Analysis Results:", data);

      const draftItems = Array.isArray(data.draft) ? data.draft : [];
      setDraft(draftItems);
      if (data?.noFoodDetected || draftItems.length === 0) {
        setAnalysisMessage("We couldn’t see any food. Try again?");
      }
      onAnalysisComplete?.({ draft: draftItems, imageUrl: publicUrl });
    } catch (err: unknown) {
      console.error("💥 [DEBUG] Error:", err);
      const msg = err instanceof Error ? err.message : "Failed to process image";
      setError(msg);
      toast.error(msg);
      onAnalysisError?.(msg);
    } finally {
      setIsImageUploading(false);
      setIsAnalyzing(false);
    }
  }, [onAnalysisComplete, onAnalysisError, onAnalysisStart, supabase]);

  const stopScanning = useCallback(() => {
    setShowScanner(false);
    setDraft([]);
    setError(null);
    setImagePublicUrl(null);
    setIsAnalyzing(false);
    setIsImageUploading(false);
    setAnalysisMessage(null);
    setLastScannedCode(null);
    setIsScanningBarcode(false);
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        scannerRef.current?.clear?.();
        scannerRef.current = null;
        setHasScannerInstance(false);
      });
    }
  }, []);

  // --- Barcode Logic ---
  const handleCapture = useCallback((blob: Blob | null) => {
     if (blob && blob instanceof File) {
         void handleImageUpload(blob);
     } else if (blob) {
         const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
         void handleImageUpload(file);
     }
  }, [handleImageUpload]);

  const handleBarcodeMatch = useCallback(
    async (code: string) => {
      setError(null);
      setIsScanningBarcode(true);
      try {
        const response = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
        );
        if (!response.ok) throw new Error("OpenFoodFacts lookup failed");
        
        const payload = await response.json();
        const product = payload.product;
        if (!product) throw new Error("No product found for that barcode.");

        const nutriments = product.nutriments ?? {};
        
        const macroMatch: MacroMatch = {
          description: product.product_name || `Barcode: ${code}`,
          kcal_100g: nutriments["energy-kcal_100g"] ?? nutriments.energy_kcal_100g ?? 0,
          protein_100g: nutriments.proteins_100g ?? 0,
          carbs_100g: nutriments.carbohydrates_100g ?? 0,
          fat_100g: nutriments.fat_100g ?? 0,
        };

        if (onProductLoaded) {
            await onProductLoaded(macroMatch);
        } else {
            toast.success(`Scanned: ${macroMatch.description}`);
        }
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : "Unable to load barcode information.";
        setError(message);
        if (onError) onError(message);
        toast.error(message);
      } finally {
        setIsScanningBarcode(false);
        setShowScanner(false);
      }
    },
    [onError, onProductLoaded],
  );

  useEffect(() => {
    if (!showScanner) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
            scannerRef.current?.clear?.();
            scannerRef.current = null;
            setHasScannerInstance(false);
        });
      }
      return;
    }

    let cancelled = false;
    const startScanner = async () => {
      try {
        await loadScannerScript();
        if (cancelled) return;
        const Html5Qrcode = window.Html5Qrcode;
        if (!Html5Qrcode) return;

        const scanner = new Html5Qrcode("barcode-reader");
        scannerRef.current = scanner;
        setHasScannerInstance(true);
        
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: 250 },
          (decodedText) => {
            if (!decodedText || decodedText === lastScannedCode) return;
            setLastScannedCode(decodedText);
            void handleBarcodeMatch(decodedText);
          },
          () => {},
        );
      } catch (err) {
        console.log("Barcode scanner failed to start (normal if in Photo mode):", err);
      }
    };
    
    const timer = setTimeout(startScanner, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
            scannerRef.current = null;
        });
      }
    };
  }, [showScanner, lastScannedCode, handleBarcodeMatch]);

  const toggleScanner = () => {
    setLastScannedCode(null);
    setShowScanner((prev) => !prev);
  };

  return {
    showScanner,
    setShowScanner,
    stopScanning,
    error,
    setError,
    toggleScanner,
    draft,
    setDraft,
    isAnalyzing,
    isImageUploading,
    imagePublicUrl,
    handleCapture,
    handleImageUpload,
    analysisMessage,
    hasScannerInstance,
    isScanningBarcode,
    scannerError: error,
  };
}
