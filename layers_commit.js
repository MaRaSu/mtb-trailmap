const fs = require("fs");
const path = require("path");

const { validateJson, diffJson } = require("./common_module");

// Extract command line arguments
const [jsonEditedPath, jsonOriginalPath] = process.argv.slice(2);

if (!jsonEditedPath || !jsonOriginalPath) {
  console.log("Usage: node script.js <edited style json> <original style json>");
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
async function processFile(jsonEditedPath, jsonOriginalPath) {
  const jsonEditedContent = readJSONFile(jsonEditedPath);
  const jsonOriginalContent = readJSONFile(jsonOriginalPath);

  // Check that changes are limited to layer content
  console.log("Comparing edited and original JSON content...");
  diffJson(jsonEditedContent, jsonOriginalContent);

  const newLayers = [];
  // Loop through each layer in the JSON content
  jsonOriginalContent.layers.forEach((layer) => {
    // Find the corresponding layer in the original JSON content
    const editedLayer = jsonEditedContent.layers.find((l) => l.id === layer.id);

    if (!editedLayer) {
      newLayers.push(layer);
    } else {
      const newContent = {
        type: editedLayer.type,
        "source-layer": editedLayer["source-layer"],
        filter: editedLayer.filter,
        minzoom: editedLayer.minzoom,
        maxzoom: editedLayer.maxzoom,
        layout: editedLayer.layout,
        paint: editedLayer.paint,
      };
      // remove keys that have undefined values
      Object.keys(newContent).forEach(
        (key) => newContent[key] === undefined && delete newContent[key]
      );

      // copy visibility from original layer
      if (newContent?.layout?.visibility && layer?.layout?.visibility) {
        newContent.layout.visibility = layer.layout.visibility;
      }

      const newLayer = { ...layer, ...newContent };
      newLayers.push(newLayer);
    }
  });

  jsonOriginalContent.layers = newLayers;

  console.log("\nValidating new JSON content...");
  validateJson(jsonOriginalContent);
  console.log("");

  const originalFilePath = path.join(
    path.dirname(jsonOriginalPath),
    path.basename(jsonOriginalPath, ".json") + "_old.json"
  );
  const processedFilePath = jsonOriginalPath;

  // Copy original file to a new name
  fs.copyFileSync(jsonOriginalPath, originalFilePath);

  // Write processed data back to the original file
  writeJSONFile(processedFilePath, jsonOriginalContent);

  console.log(`Processed file saved as: ${processedFilePath}`);
  console.log(`Original file backed up as: ${originalFilePath}`);
}

// Execute the processing function
processFile(jsonEditedPath, jsonOriginalPath);
