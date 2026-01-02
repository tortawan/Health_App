/* eslint-disable no-console */
/**
 * Downloads the USDA Foundation Foods CSV bundle, unzips it, and writes
 * structured JSON versions of `food.csv` and `food_nutrient.csv` to disk.
 *
 * Usage:
 *   USDA_DATA_URL="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2024-10-24.zip" node scripts/download_usda.js
 */
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { parse } = require("csv-parse/sync");

const DATA_URL =
  process.env.USDA_DATA_URL ||
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2024-10-24.zip";
const OUTPUT_DIR = path.join(__dirname, "data");
const ZIP_PATH = path.join(OUTPUT_DIR, "usda.zip");
const EXTRACT_DIR = path.join(OUTPUT_DIR, "usda");

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function downloadZip() {
  console.log(`Downloading USDA dataset from ${DATA_URL} ...`);
  const response = await fetch(DATA_URL);

  if (!response.ok) {
    throw new Error(`Failed to download USDA dataset: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(ZIP_PATH, buffer);
  console.log(`Saved zip to ${ZIP_PATH} (${(buffer.length / 1_048_576).toFixed(1)} MB)`);
}

function findFile(rootDir, targetName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, targetName);
      if (found) return found;
    } else if (entry.isFile() && entry.name.toLowerCase() === targetName) {
      return fullPath;
    }
  }

  return null;
}

function extractZip() {
  console.log("Extracting zip contents...");
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(EXTRACT_DIR, true);

  const foodPath = findFile(EXTRACT_DIR, "food.csv");
  const foodNutrientPath = findFile(EXTRACT_DIR, "food_nutrient.csv");

  if (!foodPath || !foodNutrientPath) {
    throw new Error(
      `Could not locate food.csv (${foodPath}) or food_nutrient.csv (${foodNutrientPath}).`,
    );
  }

  return { foodPath, foodNutrientPath };
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath);
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
  });
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await downloadZip();
  const { foodPath, foodNutrientPath } = extractZip();

  console.log("Parsing CSV files (this may take a moment)...");
  const foodRows = parseCsv(foodPath);
  const nutrientRows = parseCsv(foodNutrientPath);

  await fs.promises.writeFile(
    path.join(OUTPUT_DIR, "food.json"),
    JSON.stringify(foodRows, null, 2),
  );
  await fs.promises.writeFile(
    path.join(OUTPUT_DIR, "food_nutrient.json"),
    JSON.stringify(nutrientRows, null, 2),
  );

  console.log(
    `Done. Parsed ${foodRows.length} foods and ${nutrientRows.length} nutrient rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
