import { pipeline } from "@xenova/transformers";

const modelId = process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2";

let cachedEmbedder:
  | null
  | ((
      input: string,
    ) => Promise<{ data: number[]; dims: number }>) = null;

export async function getEmbedder() {
  if (cachedEmbedder) return cachedEmbedder;

  const pipe = await pipeline("feature-extraction", modelId);

  cachedEmbedder = async (input: string) => {
    const result = await pipe(input, { pooling: "mean", normalize: true });
    const data = Array.from(result.data as Float32Array);
    return { data, dims: result.dims ?? data.length };
  };

  return cachedEmbedder;
}
