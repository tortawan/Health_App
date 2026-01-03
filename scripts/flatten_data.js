/* eslint-disable no-console */
/**
 * Flattens the USDA Foundation Foods dataset into the schema expected by
 * `usda_library`: one row per food with macro nutrients per 100g.
 *
 * Prerequisite: run `node scripts/download_usda.js` to produce data/food.json
 * and data/food_nutrient.json.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "flattened.json");
const RAW_FOOD_FILE = path.join(DATA_DIR, "food.json");
const RAW_NUTRIENT_FILE = path.join(DATA_DIR, "food_nutrient.json");

const MACRO_IDS = {
  kcal_100g: 1008, // Energy (kcal)
  protein_100g: 1003,
  carbs_100g: 1005,
  fat_100g: 1004,
  fiber_100g: 1079,
  sugar_100g: 2000,
  sodium_100g: 1093,
};

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}. Did you run download_usda.js?`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildMacroMap(nutrientRows) {
  const macroMap = new Map();

  for (const row of nutrientRows) {
    const macroKey = Object.entries(MACRO_IDS).find(
      ([, nutrientId]) => Number(row.nutrient_id) === nutrientId,
    )?.[0];

    if (!macroKey) continue;

    const foodId = Number(row.fdc_id);
    const macros = macroMap.get(foodId) ?? {};
    macros[macroKey] = Number(row.amount);
    macroMap.set(foodId, macros);
  }

  return macroMap;
}

function flattenFoods(foodRows, macroMap) {
  return foodRows
    .map((food) => {
      const foodId = Number(food.fdc_id);
      const macros = macroMap.get(foodId) ?? {};

      return {
        id: foodId,
        description: food.description,
        kcal_100g: macros.kcal_100g ?? null,
        protein_100g: macros.protein_100g ?? null,
        carbs_100g: macros.carbs_100g ?? null,
        fat_100g: macros.fat_100g ?? null,
        fiber_100g: macros.fiber_100g ?? null,
        sugar_100g: macros.sugar_100g ?? null,
        sodium_100g: macros.sodium_100g ?? null,
      };
    })
    .filter((row) => !!row.description);
}

function main() {
  const foodRows = loadJson(RAW_FOOD_FILE);
  const nutrientRows = loadJson(RAW_NUTRIENT_FILE);

  console.log(
    `Loaded ${foodRows.length} foods and ${nutrientRows.length} nutrient rows. Flattening...`,
  );

  const macroMap = buildMacroMap(nutrientRows);
  const flattened = flattenFoods(foodRows, macroMap);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flattened, null, 2));
  console.log(`Wrote ${flattened.length} flattened foods to ${OUTPUT_FILE}`);
}

main();
