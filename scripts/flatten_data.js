/* eslint-disable no-console */
/**
 * Flattens the USDA Foundation Foods dataset.
 * Streams `food_nutrient.csv` to avoid memory issues.
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");

const DATA_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "flattened.json");
const RAW_FOOD_FILE = path.join(DATA_DIR, "food.json");
const RAW_NUTRIENT_CSV = path.join(DATA_DIR, "food_nutrient.csv");

const MACRO_IDS = {
  kcal_100g: 1008,
  protein_100g: 1003,
  carbs_100g: 1005,
  fat_100g: 1004,
  fiber_100g: 1079,
  sugar_100g: 2000,
  sodium_100g: 1093,
};

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// FIX: Stream the CSV instead of loading a giant JSON
async function buildMacroMap() {
  console.log("Streaming nutrient data (this filters rows on the fly)...");
  const macroMap = new Map();
  
  if (!fs.existsSync(RAW_NUTRIENT_CSV)) {
    throw new Error(`Missing ${RAW_NUTRIENT_CSV}. Run download_usda.js first.`);
  }

  const parser = fs
    .createReadStream(RAW_NUTRIENT_CSV)
    .pipe(parse({ columns: true, cast: true }));

  let rowsProcessed = 0;

  for await (const row of parser) {
    rowsProcessed++;
    if (rowsProcessed % 500000 === 0) process.stdout.write(".");

    // Only keep the nutrient IDs we care about
    const nutrientId = Number(row.nutrient_id);
    const macroKey = Object.entries(MACRO_IDS).find(
      ([, id]) => id === nutrientId,
    )?.[0];

    if (!macroKey) continue;

    const foodId = Number(row.fdc_id);
    if (!macroMap.has(foodId)) {
      macroMap.set(foodId, {});
    }
    macroMap.get(foodId)[macroKey] = Number(row.amount);
  }
  
  console.log(`\nProcessed ${rowsProcessed} nutrient rows.`);
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

async function main() {
  const foodRows = loadJson(RAW_FOOD_FILE);
  console.log(`Loaded ${foodRows.length} food items.`);

  const macroMap = await buildMacroMap();
  const flattened = flattenFoods(foodRows, macroMap);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flattened, null, 2));
  console.log(`Success! Wrote ${flattened.length} flattened foods to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});