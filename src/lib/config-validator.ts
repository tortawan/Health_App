export function validateEmbeddingModel() {
  const envModel = process.env.EMBEDDING_MODEL;
  const REQUIRED = 'Xenova/all-MiniLM-L6-v2';

  if (!envModel) {
    throw new Error('EMBEDDING_MODEL env var missing. Required: Xenova/all-MiniLM-L6-v2');
  }

  if (envModel !== REQUIRED) {
    throw new Error(`EMBEDDING_MODEL mismatch: "${envModel}" ≠ "${REQUIRED}". Vectors incompatible!`);
  }

  return true;
}