import { EMBEDDING_MODEL } from "@/lib/embedding-constants";

export function validateEmbeddingModel(envModel = process.env.EMBEDDING_MODEL) {
  if (!envModel) {
    throw new Error(
      `EMBEDDING_MODEL env var missing. Required: ${EMBEDDING_MODEL}`,
    );
  }

  if (envModel !== EMBEDDING_MODEL) {
    throw new Error(
      `EMBEDDING_MODEL mismatch: "${envModel}" ≠ "${EMBEDDING_MODEL}". Vectors incompatible!`,
    );
  }

  return envModel;
}
