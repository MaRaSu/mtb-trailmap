const fs = require("fs");
const path = require("path");

const { validateJson } = require("./common_module");

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

// Main function to process the file
async function processFile(jsonPath) {
  // Read the json file
  const jsonContent = readJSONFile(jsonPath);
  validateJson(jsonContent);
}

// Execute the processing function
processFile(jsonPath);
