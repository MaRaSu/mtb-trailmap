const fs = require("fs");
const path = require("path");
const { diffJson, diffContentJson } = require("./common_module");

// Extract command line arguments
const [v1, v2] = process.argv.slice(2);

if (!v1 || !v2) {
  console.log("Usage: node script.js <style v1 file> <style v2 file>");
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
function processFile(v1, v2) {
  const jsonV1 = readJSONFile(v1);
  const jsonV2 = readJSONFile(v2);

  diffJson(jsonV1, jsonV2);
  diffContentJson(jsonV1, jsonV2);
}

// Execute the processing function
processFile(v1, v2);
