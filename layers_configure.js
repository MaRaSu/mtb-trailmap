const fs = require("fs");
const path = require("path");

// Extract command line arguments
const [filePath, variantTag, countryTag, hcTag] = process.argv.slice(2);

if (!filePath || !variantTag) {
  console.log("Usage: node script.js <json file> <variant tag> <country tag> <hc tag>");
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
function processFile(filePath, variantTag, countryTag, hcTag) {
  const jsonContent = readJSONFile(filePath);

  // Update visibility based on tag
  jsonContent.layers = jsonContent.layers.map((layer) => {
    if (!layer.metadata || Object.keys(layer.metadata).length === 0) {
      console.log(`Layer ${layer.id} has no metadata, is kept as is`);
      return layer;
    }

    const variantRealTag = "trailmap:" + variantTag;
    const variantVisible = layer.metadata.hasOwnProperty(variantRealTag)
      ? layer.metadata[variantRealTag]
      : false;

    let countryVisible = true;
    if (countryTag) {
      const countryRealTag = "trailmap:country";
      countryVisible = layer.metadata.hasOwnProperty(countryRealTag)
        ? [countryTag, "all"].includes(layer.metadata[countryRealTag])
        : true;
    }

    let hcVisible = true;
    const hcRealTag = "trailmap:high_contrast";
    if (layer.metadata.hasOwnProperty(hcRealTag)) {
      if (hcTag) {
        hcVisible = ["yes", "exclusive"].includes(layer.metadata[hcRealTag]);
      } else {
        hcVisible = ["no", "yes"].includes(layer.metadata[hcRealTag]);
      }
    } else {
      console.log(`Layer ${layer.id} has no high contrast metadata, is kept as is`);
    }

    const shouldBeVisible = variantVisible && countryVisible && hcVisible;

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

    return layer;
  });

  const processedFilePath = path.join(
    path.dirname(filePath),
    path.basename(filePath, ".json") + "_edit.json"
  );

  // Write processed data back to the original file
  writeJSONFile(processedFilePath, jsonContent);

  console.log(`Processed file saved as: ${processedFilePath}`);
}

// Execute the processing function
processFile(filePath, variantTag, countryTag, hcTag);
