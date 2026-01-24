import { getEmbedder } from "../src/lib/embedder";
import { EMBEDDING_DIMS } from "../src/lib/embedding-constants";

async function main() {
  const embedder = await getEmbedder();
  const { dims } = await embedder("Health App embedding check");

  if (dims !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${EMBEDDING_DIMS}, received ${dims}.`,
    );
  }

  console.log(`✅ Embedding dimensions verified: ${dims}`);
}

main().catch((error) => {
  console.error("Embedding verification failed", error);
  process.exit(1);
});
