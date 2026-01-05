/* eslint-disable no-console */
/**
 * Downloads the USDA Foundation Foods CSV bundle, extracts it,
 * writes `food.json`, and copies `food_nutrient.csv` for streaming later.
 */
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { parse } = require("csv-parse/sync");

const DATA_URL =
  process.env.USDA_DATA_URL ||
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2024-10-31.zip";
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
  if (!fs.existsSync(rootDir)) return null;
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
      `Could not locate food.csv or food_nutrient.csv in ${EXTRACT_DIR}`,
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
  
  // Only download if we don't have the zip yet (optional optimization)
  if (!fs.existsSync(ZIP_PATH)) {
    await downloadZip();
  } else {
    console.log("Zip already exists, skipping download.");
  }

  const { foodPath, foodNutrientPath } = extractZip();

  console.log("Parsing food.csv...");
  const foodRows = parseCsv(foodPath);
  await fs.promises.writeFile(
    path.join(OUTPUT_DIR, "food.json"),
    JSON.stringify(foodRows, null, 2),
  );

  // FIX: Do NOT parse food_nutrient.csv into JSON. It is too big.
  // Instead, copy it to a known location so the next script can stream it.
  console.log("Copying food_nutrient.csv (large file)...");
  const destNutrientPath = path.join(OUTPUT_DIR, "food_nutrient.csv");
  await fs.promises.copyFile(foodNutrientPath, destNutrientPath);

  console.log(
    `Done. Processed ${foodRows.length} foods. Nutrient data copied to ${destNutrientPath} for streaming.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});