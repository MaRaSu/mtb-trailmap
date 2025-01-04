const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const expectedMetadataKeys = [
  "mtb",
  "mtb_high_contrast",
  "gravel",
  "mtb_winter",
  "mapper",
  "ways_only",
];

// Extract command line arguments
const [jsonPath] = process.argv.slice(2);

if (!jsonPath) {
  console.log("Usage: node script.js <style json path>");
  process.exit(1);
}

// Function to read JSON file
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file from disk: ${error}`);
    process.exit(1);
  }
}

function logCharCodes(str) {
  return str.split("").map((char) => char.charCodeAt(0));
}

// Main function to process the file
async function processFile(jsonPath) {
  // Read the json file
  const jsonContent = readJSONFile(jsonPath);
  const layers = jsonContent.layers;

  // Find any duplicate layer ids
  const layerIds = layers.map((layer) => layer.id);
  const duplicates = layerIds.filter(
    (id, index) => layerIds.indexOf(id) !== index
  );
  console.log("Duplicate layer ids: ", duplicates);
}

// Execute the processing function
processFile(jsonPath);
