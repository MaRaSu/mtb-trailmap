const fs = require("fs");
const path = require("path");

// Extract command line arguments
const [filePath, argtag] = process.argv.slice(2);

if (!filePath || !argtag) {
  console.log("Usage: node script.js <file path> <tag>");
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

// Function to write JSON file
function writeJSONFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error(`Error writing file to disk: ${error}`);
    process.exit(1);
  }
}

// Main function to process the file
function processFile(filePath, tag) {
  const jsonContent = readJSONFile(filePath);

  // Update visibility based on tag
  jsonContent.layers = jsonContent.layers.map((layer) => {
    if (
      layer.metadata &&
      (layer.metadata.hasOwnProperty(tag) ||
        Object.keys(layer.metadata).length > 0)
    ) {
      const shouldBeVisible = layer.metadata.hasOwnProperty(tag)
        ? layer.metadata[tag]
        : false;
      if (shouldBeVisible === true) {
        if (layer.layout && layer.layout.visibility) {
          layer.layout.visibility = "visible";
        }
        // If layout.visibility does not exist, do not add it as visibility defaults to 'visible'
      } else {
        // If shouldBeVisible is false, ensure layout.visibility is set to 'none'
        if (!layer.layout) layer.layout = {};
        layer.layout.visibility = "none";
      }
    }
    return layer;
  });

  const originalFilePath = path.join(
    path.dirname(filePath),
    path.basename(filePath, ".json") + "_orig.json"
  );
  const processedFilePath = filePath;

  // Copy original file to a new name
  fs.copyFileSync(filePath, originalFilePath);

  // Write processed data back to the original file
  writeJSONFile(processedFilePath, jsonContent);

  console.log(`Processed file saved as: ${processedFilePath}`);
  console.log(`Original file backed up as: ${originalFilePath}`);
}

// Execute the processing function
processFile(filePath, "trailmap:" + argtag);
