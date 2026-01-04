import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { MacroMatch } from "@/types/food";

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
  onProductLoaded: (match: MacroMatch) => Promise<void> | void;
  onError?: (message: string) => void;
};

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
        {
          once: true,
        },
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

export function useScanner({ onProductLoaded, onError }: UseScannerOptions) {
  const [showScanner, setShowScanner] = useState(false);
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [hasScannerInstance, setHasScannerInstance] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  const handleBarcodeMatch = useCallback(
    async (code: string) => {
      setScannerError(null);
      setIsScanningBarcode(true);
      try {
        const response = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
        );
        if (!response.ok) {
          throw new Error("OpenFoodFacts lookup failed");
        }
        const payload = await response.json();
        const product = payload.product;
        if (!product) {
          throw new Error("No product found for that barcode.");
        }
        const nutriments = product.nutriments ?? {};
        const macroMatch: MacroMatch = {
          description: product.product_name || code,
          kcal_100g:
            nutriments["energy-kcal_100g"] ??
            nutriments.energy_kcal_100g ??
            nutriments.energy_value ??
            null,
          protein_100g: nutriments.proteins_100g ?? null,
          carbs_100g: nutriments.carbohydrates_100g ?? null,
          fat_100g: nutriments.fat_100g ?? null,
          fiber_100g: nutriments.fiber_100g ?? null,
          sugar_100g: nutriments.sugars_100g ?? null,
          sodium_100g: nutriments.sodium_100g ?? null,
        };

        await onProductLoaded(macroMatch);
        toast.success(`Loaded ${macroMatch.description} from barcode`);
      } catch (err) {
        console.error(err);
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load barcode information.";
        setScannerError(message);
        onError?.(message);
        toast.error("Unable to load barcode");
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
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear?.();
            scannerRef.current = null;
            setHasScannerInstance(false);
          });
      }
      return;
    }
    let cancelled = false;
    const startScanner = async () => {
      setScannerError(null);
      setIsScanningBarcode(true);
      try {
        await loadScannerScript();
        if (cancelled) return;
        const Html5Qrcode = window.Html5Qrcode;
        if (!Html5Qrcode) {
          throw new Error("html5-qrcode is unavailable.");
        }
        const scanner = new Html5Qrcode("barcode-reader");
        scannerRef.current = scanner;
        setHasScannerInstance(true);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: 250 },
          (decodedText: string) => {
            if (!decodedText || decodedText === lastScannedCode) return;
            setLastScannedCode(decodedText);
            void handleBarcodeMatch(decodedText);
          },
          () => {},
        );
      } catch (err) {
        console.error(err);
        const message =
          err instanceof Error
            ? err.message
            : "Unable to start the barcode scanner.";
        setScannerError(message);
        onError?.(message);
        setShowScanner(false);
      } finally {
        setIsScanningBarcode(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear?.();
            scannerRef.current = null;
            setHasScannerInstance(false);
          });
      }
    };
  }, [showScanner, lastScannedCode, handleBarcodeMatch, onError]);

  const toggleScanner = () => {
    setLastScannedCode(null);
    setShowScanner((prev) => !prev);
  };

  return {
    hasScannerInstance,
    isScanningBarcode,
    scannerError,
    showScanner,
    toggleScanner,
  };
}
