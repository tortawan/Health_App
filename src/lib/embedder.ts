import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@xenova/transformers";
import { validateEmbeddingDimensions } from "@/lib/embedding-constants";
import { validateEmbeddingModel } from "@/lib/config-validator";
import { LruCache } from "@/lib/lru-cache";

const modelId = validateEmbeddingModel();
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
const embeddingCache = new LruCache<string, number[]>({ maxSize: 500 });

const shouldDebugCache = Boolean(process.env.DEBUG_EMBED_CACHE);
const logCacheEvent = (event: "hit" | "miss", key: string) => {
  if (!shouldDebugCache) return;
  console.debug(`[Embedder Cache] ${event}`, { key });
};

const normalizeEmbeddingKey = (input: string) => input.trim().toLowerCase();

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
    const normalizedKey = normalizeEmbeddingKey(input);
    const cachedEmbedding = embeddingCache.get(normalizedKey);
    if (cachedEmbedding) {
      logCacheEvent("hit", normalizedKey);
      const dims = cachedEmbedding.length;
      validateEmbeddingDimensions(dims, "runtime embedder");
      return { data: cachedEmbedding, dims };
    }

    logCacheEvent("miss", normalizedKey);
    const result = await cachedPipeline(input, {
      pooling: "mean",
      normalize: true,
      localFilesOnly: usingLocalModelCache,
    });
    const data = Array.from(result.data as Float32Array);
    const dims = result.dims ?? data.length;
    validateEmbeddingDimensions(dims, "runtime embedder");
    embeddingCache.set(normalizedKey, data);
    return { data, dims };
  };

  return cachedEmbedder;
}
