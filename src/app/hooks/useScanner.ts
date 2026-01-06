// src/app/hooks/useScanner.ts

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { manualSearch } from "../actions";
import type { DraftLog, MacroMatch } from "@/types/food";
import { createClient } from "@/lib/supabase-browser"; // Ensure you have this or standard supabase client

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

// Make options optional to prevent crash if HomeClient doesn't pass them
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
  const supabase = createClient();

  // --- Shared State ---
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Image Analysis State (Restored) ---
  const [draft, setDraft] = useState<DraftLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);

  // --- Barcode State ---
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [hasScannerInstance, setHasScannerInstance] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  // --- Image Handling Logic (Restored for HomeClient) ---
  const handleImageUpload = async (file: File) => {
    setError(null);
    setIsImageUploading(true);
    try {
      // 1. Upload to Supabase Storage
      const fileName = `${crypto.randomUUID()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("food-images") // Adjust bucket name if needed
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("food-images")
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
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Failed to process image";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsImageUploading(false);
      setIsAnalyzing(false);
    }
  };

  const handleCapture = useCallback((blob: Blob | null) => {
     if (blob && blob instanceof File) {
         void handleImageUpload(blob);
     } else if (blob) {
         // Convert blob to file if needed, or upload blob directly
         const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
         void handleImageUpload(file);
     }
  }, []);

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
        let macroMatch: MacroMatch = {
          description: product.product_name || `Barcode: ${code}`,
          kcal_100g: nutriments["energy-kcal_100g"] ?? nutriments.energy_kcal_100g ?? 0,
          protein_100g: nutriments.proteins_100g ?? 0,
          carbs_100g: nutriments.carbohydrates_100g ?? 0,
          fat_100g: nutriments.fat_100g ?? 0,
        };

        // Call the external handler if provided (HomeClient currently doesn't pass this, but it might in future)
        if (onProductLoaded) {
            await onProductLoaded(macroMatch);
        } else {
            // If no handler, maybe add to draft directly?
            // For now, let's just toast
            toast.success(`Scanned: ${macroMatch.description}`);
        }
      } catch (err: any) {
        console.error(err);
        const message = err.message || "Unable to load barcode information.";
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

    // Only start barcode scanner if we are NOT in "Draft Mode" (implied by image capture logic)
    // But for now, we leave the effect running; users switch modes in UI.
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
        // Ignore errors if element not found (e.g. user is in Photo mode)
        console.log("Barcode scanner failed to start (normal if in Photo mode):", err);
      }
    };
    
    // Slight delay to allow DOM to render
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

  // --- Return Combined Interface ---
  return {
    // Shared
    showScanner,
    setShowScanner,
    error,
    setError,
    toggleScanner,
    
    // Image / Draft Logic (Required by HomeClient)
    draft,
    setDraft,
    isAnalyzing,
    isImageUploading,
    imagePublicUrl,
    handleCapture,
    handleImageUpload,
    
    // Barcode Logic
    hasScannerInstance,
    isScanningBarcode,
    scannerError: error, // alias for compatibility
  };
}