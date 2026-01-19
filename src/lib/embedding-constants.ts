export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

export function validateEmbeddingModel(model = EMBEDDING_MODEL) {
  if (model !== EMBEDDING_MODEL) {
    throw new Error(
      `Embedding model mismatch. Expected ${EMBEDDING_MODEL} but received ${model}.`,
    );
  }
  return model;
}

export function validateEmbeddingDimensions(dimensions: number, context = "embedding") {
  if (dimensions !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding dimension mismatch for ${context}. Expected ${EMBEDDING_DIMS} but received ${dimensions}.`,
    );
  }
}
