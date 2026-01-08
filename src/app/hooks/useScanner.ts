// src/app/hooks/useScanner.ts

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
// Removed unused 'manualSearch' import to fix Lint Error 1
import type { DraftLog, MacroMatch } from "@/types/food";
import { createClient } from "@/lib/supabase-browser";

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
  const { onProductLoaded, onError } = options;
  // Initialize Supabase client
  const supabase = createClient();

  // --- Shared State ---
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Image Analysis State ---
  const [draft, setDraft] = useState<DraftLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);

  // --- Barcode State ---
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [hasScannerInstance, setHasScannerInstance] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  // --- Image Handling Logic ---
  // Fix Lint Error 4: Wrapped in useCallback so it can be a dependency
  const handleImageUpload = useCallback(async (file: File) => {
    setError(null);
    setIsImageUploading(true);
    try {
      // 1. Upload to Supabase Storage
      const fileName = `${crypto.randomUUID()}-${file.name}`;
      
      // Fix Lint Error 2: Removed unused 'uploadData' variable
      const { error: uploadError } = await supabase.storage
        .from("food-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("food-photos")
        .getPublicUrl(fileName);
      
      const publicUrl = publicUrlData.publicUrl;
      setImagePublicUrl(publicUrl);
      setIsImageUploading(false);

      // 2. Analyze Image
      setIsAnalyzing(true);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      
      const data = await response.json();
      if (data.foods) {
        setDraft(data.foods);
      }
    } catch (err: unknown) { // Fix Lint Error 3: Changed 'any' to 'unknown'
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to process image";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsImageUploading(false);
      setIsAnalyzing(false);
    }
  }, [supabase]); // Added supabase dependency

  // Fix Lint Error 4: Added handleImageUpload to dependency array
  const handleCapture = useCallback((blob: Blob | null) => {
     if (blob && blob instanceof File) {
         void handleImageUpload(blob);
     } else if (blob) {
         const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
         void handleImageUpload(file);
     }
  }, [handleImageUpload]);

  // --- Barcode Logic ---
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
        
        // Fix Lint Error 5: Changed 'let' to 'const' as it is never reassigned
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
      } catch (err: unknown) { // Fix Lint Error 6: Changed 'any' to 'unknown'
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
    hasScannerInstance,
    isScanningBarcode,
    scannerError: error,
  };
}