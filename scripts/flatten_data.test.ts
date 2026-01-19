import { describe, expect, it } from "vitest";
import { buildMacroMapFromRows, flattenFoods } from "./flatten_data.js";

describe("flatten_data", () => {
  it("flattens macro nutrients for a small fixture", () => {
    const foodRows = [
      { fdc_id: 1, description: "Apple" },
      { fdc_id: 2, description: "Almonds" },
    ];

    const nutrientRows = [
      { fdc_id: 1, nutrient_id: 1008, amount: 52 },
      { fdc_id: 1, nutrient_id: 1003, amount: 0.3 },
      { fdc_id: 2, nutrient_id: 1008, amount: 579 },
      { fdc_id: 2, nutrient_id: 1004, amount: 49.9 },
      { fdc_id: 999, nutrient_id: 1008, amount: 100 },
    ];

    const macroMap = buildMacroMapFromRows(nutrientRows);
    const flattened = flattenFoods(foodRows, macroMap);

    expect(flattened).toEqual([
      {
        id: 1,
        description: "Apple",
        kcal_100g: 52,
        protein_100g: 0.3,
        carbs_100g: null,
        fat_100g: null,
        fiber_100g: null,
        sugar_100g: null,
        sodium_100g: null,
      },
      {
        id: 2,
        description: "Almonds",
        kcal_100g: 579,
        protein_100g: null,
        carbs_100g: null,
        fat_100g: 49.9,
        fiber_100g: null,
        sugar_100g: null,
        sodium_100g: null,
      },
    ]);
  });
});
