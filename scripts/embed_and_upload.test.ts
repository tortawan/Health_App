import { describe, expect, it, vi } from "vitest";
import { chunk, buildPayloadForBatch, uploadBatches } from "./embed_and_upload.js";

describe("embed_and_upload", () => {
  it("chunks arrays into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("builds payloads with embeddings", async () => {
    const foods = [
      { id: 1, description: "Apple", kcal_100g: 52, protein_100g: 0.3, carbs_100g: 14, fat_100g: 0.2 },
    ];
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    const payload = await buildPayloadForBatch(foods, embed);

    expect(embed).toHaveBeenCalledWith("Apple");
    expect(payload).toEqual([
      {
        id: 1,
        description: "Apple",
        kcal_100g: 52,
        protein_100g: 0.3,
        carbs_100g: 14,
        fat_100g: 0.2,
        fiber_100g: undefined,
        sugar_100g: undefined,
        sodium_100g: undefined,
        embedding: [0.1, 0.2, 0.3],
      },
    ]);
  });

  it("uploads batches to Supabase with correct payload shape", async () => {
    const foods = [
      { id: 1, description: "Apple", kcal_100g: 52 },
      { id: 2, description: "Banana", kcal_100g: 96 },
      { id: 3, description: "Carrot", kcal_100g: 41 },
    ];

    const embed = vi.fn().mockResolvedValue([0.5, 0.6]);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert }),
    };

    await uploadBatches({
      foods,
      batchSize: 2,
      embed,
      supabase,
    });

    expect(supabase.from).toHaveBeenCalledWith("usda_library");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
    expect(upsert.mock.calls[1][0]).toHaveLength(1);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({
      id: 1,
      description: "Apple",
      kcal_100g: 52,
      embedding: [0.5, 0.6],
    });
    expect(upsert.mock.calls[1][0][0]).toMatchObject({
      id: 3,
      description: "Carrot",
      kcal_100g: 41,
      embedding: [0.5, 0.6],
    });
  });
});
