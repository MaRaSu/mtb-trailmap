const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const { validateJson } = require("./common_module");

const expectedMetadataKeys = [
  "mtb",
  "high_contrast",
  "gravel",
  "mtb_winter",
  "mapper",
  "ways_only",
];

// Extract command line arguments
const [csvPath, jsonPath, csvDelimiter] = process.argv.slice(2);

if (!csvPath || !jsonPath || !csvDelimiter) {
  console.log("Usage: node script.js <id csv path> <style json path> <csv delimiter>");
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

// Function to write CSV file
function writeCSVFile(filePath, data) {
  // Write the data to a CSV file: each element in the array is a row
  try {
    fs.writeFileSync(filePath, data.join("\n"), "utf8");
  } catch (error) {
    console.error(`Error writing file to disk: ${error}`);
    process.exit(1);
  }
}

function logCharCodes(str) {
  return str.split("").map((char) => char.charCodeAt(0));
}

// Main function to process the file
async function processFile(csvPath, jsonPath, csvDelimiter) {
  // Read the csv file and json file
  let csvContent = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(
        csv({
          separator: ",",
          mapHeaders: ({ header }) => header.replace(/"/g, "").trim(),
        })
      )
      .on("data", (data) => csvContent.push(data))
      .on("end", () => {
        resolve(); // Resolve the promise when the file read operation is complete
      })
      .on("error", (error) => reject(error)); // Reject the promise if there is an error
  });

  const jsonContent = readJSONFile(jsonPath);

  // Find all layers in the JSON content that have an id that is not in the CSV file
  const missingLayers = jsonContent.layers.filter((layer) => {
    return !csvContent.some((item) => item.id_orig === layer.id);
  });
  if (missingLayers.length > 0) {
    console.log(`DELETED layers: ${missingLayers.map((layer) => layer.id).join(", ")}`);
  }

  // Loop through each layer in the CSV table
  const newLayers = [];
  let indexAdjustment = 0;
  for (let i = 0; i < csvContent.length; i++) {
    //for (let i = 0; i < 30; i++) {
    const item = csvContent[i];

    const itemMetadata = expectedMetadataKeys.reduce((acc, key) => {
      const fullKey = `trailmap:${key}`;
      const value = item[key];
      if (key !== "high_contrast") {
        acc[fullKey] = value === "TRUE";
      } else {
        acc[fullKey] = value;
      }
      return acc;
    }, {});
    itemMetadata["trailmap:country"] = item["country"];

    const jsonLayerIndex = jsonContent.layers.findIndex((layer) => layer.id === item.id_orig);
    const jsonLayer = jsonContent.layers[jsonLayerIndex];

    let newLayer;
    if (jsonLayer) {
      newLayer = jsonLayer;
      if (jsonLayer.id !== item.id_new) {
        console.log(`RENAME layer: ${jsonLayer.id} --> ${item.id_new}`);
        newLayer.id = item.id_new;
      }

      const adjustedJsonLayerIndex = jsonLayerIndex + indexAdjustment;
      if (i !== adjustedJsonLayerIndex) {
        console.log(`--- CHANGE layer ${jsonLayer.id} ORDER: ${jsonLayerIndex} --> ${i}`);
      }

      Object.keys(itemMetadata).forEach((key) => {
        if (jsonLayer.metadata[key] !== itemMetadata[key]) {
          console.log(
            `CHANGE in layer ${item.id_new} METADATA key ${key}: ${jsonLayer.metadata[key]} --> ${itemMetadata[key]}`
          );
        }
      });
      newLayer.metadata = { ...jsonLayer.metadata, ...itemMetadata };

      const itemSource = item["source"];
      if (itemSource && itemSource != "nosource") {
        if (itemSource != jsonLayer.source) {
          console.log(
            `CHANGE in layer ${item.id_new} SOURCE: ${jsonLayer.source} --> ${itemSource}`
          );
        }
        newLayer.source = itemSource;
      }
    } else {
      console.log(`NEW layer: ${item.id_new} in CSV row ${i + 1}`);
      newLayer = {
        id: item.id_new,
        type: "background",
        metadata: itemMetadata,
        source: item.source,
        layout: { visibility: "none" },
        paint: { "background-color": "red" },
      };
      indexAdjustment++;
    }
    //console.log(newLayer);
    newLayers.push(newLayer);
  }

  jsonContent.layers = newLayers;

  // Write the modified JSON content back to the file
  const processedFilePath = path.join(
    path.dirname(jsonPath),
    path.basename(jsonPath, ".json") + "_import.json"
  );

  console.log("\nWriting new map style: " + processedFilePath);
  fs.writeFileSync(processedFilePath, JSON.stringify(jsonContent, null, 2), "utf8");

  console.log("\nValidating new JSON content...");
  validateJson(jsonContent);
}

// Execute the processing function
processFile(csvPath, jsonPath, csvDelimiter);
