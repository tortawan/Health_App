import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@xenova/transformers";

const modelId = process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2";
const localModelDir =
  process.env.LOCAL_EMBEDDING_MODEL_PATH ??
  path.join(process.cwd(), "public", "models", modelId.split("/").pop() ?? modelId);

const hasLocalModel = (() => {
  try {
    const files = fs.readdirSync(localModelDir);
    return files.length > 0;
  } catch {
    return false;
  }
})();

let cachedEmbedder:
  | null
  | ((
      input: string,
    ) => Promise<{ data: number[]; dims: number }>) = null;

export async function getEmbedder() {
  if (cachedEmbedder) return cachedEmbedder;

  let pipe = null;
  let usingLocalModel = false;

  if (hasLocalModel) {
    try {
      pipe = await pipeline("feature-extraction", localModelDir, {
        localFilesOnly: true,
        cacheDir: localModelDir,
      });
      usingLocalModel = true;
    } catch (error) {
      console.warn("Failed to load local embedding model, falling back to remote:", error);
      pipe = null;
    }
  }

  if (!pipe) {
    pipe = await pipeline("feature-extraction", modelId);
  }

  cachedEmbedder = async (input: string) => {
    const result = await pipe(input, {
      pooling: "mean",
      normalize: true,
      localFilesOnly: usingLocalModel,
    });
    const data = Array.from(result.data as Float32Array);
    return { data, dims: result.dims ?? data.length };
  };

  return cachedEmbedder;
}
