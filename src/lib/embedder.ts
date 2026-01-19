import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@xenova/transformers";
import {
  EMBEDDING_MODEL,
  validateEmbeddingDimensions,
  validateEmbeddingModel,
} from "@/lib/embedding-constants";

const modelId = validateEmbeddingModel(process.env.EMBEDDING_MODEL ?? EMBEDDING_MODEL);
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
let cachedPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;
let pipelinePromise: Promise<Awaited<ReturnType<typeof pipeline>>> | null = null;
let usingLocalModelCache = false;

export async function getEmbedder() {
  if (cachedEmbedder) return cachedEmbedder;

  if (!cachedPipeline) {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        if (hasLocalModel) {
          try {
            const localPipe = await pipeline("feature-extraction", localModelDir, {
              localFilesOnly: true,
              cacheDir: localModelDir,
            });
            usingLocalModelCache = true;
            return localPipe;
          } catch (error) {
            console.warn("Failed to load local embedding model, falling back to remote:", error);
          }
        }

        return pipeline("feature-extraction", modelId);
      })();
    }

    cachedPipeline = await pipelinePromise;
  }

  cachedEmbedder = async (input: string) => {
    const result = await cachedPipeline(input, {
      pooling: "mean",
      normalize: true,
      localFilesOnly: usingLocalModelCache,
    });
    const data = Array.from(result.data as Float32Array);
    const dims = result.dims ?? data.length;
    validateEmbeddingDimensions(dims, "runtime embedder");
    return { data, dims };
  };

  return cachedEmbedder;
}
