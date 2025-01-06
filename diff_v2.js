const fs = require("fs");
const path = require("path");

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

  // Compare content top level properties, excluding layers, report any differences in content
  // Assume that keys are the same in both versions
  const keysV1 = Object.keys(jsonV1).filter((key) => key !== "layers");
  const keysV2 = Object.keys(jsonV2).filter((key) => key !== "layers");
  const differences = [];

  keysV1.forEach((key) => {
    if (JSON.stringify(jsonV1[key]) !== JSON.stringify(jsonV2[key])) {
      differences.push(key);
    }
  });

  if (differences.length > 0) {
    console.log("Differences in top level properties (excluding layers):");
    console.log(differences);
  }

  const layersV1 = jsonV1.layers;
  const layersV2 = jsonV2.layers;

  // Compare layers, note any differences in layer ids AND order
  const layerIdsV1 = layersV1.map((layer) => layer.id);
  const layerIdsV2 = layersV2.map((layer) => layer.id);

  // First check if v2 has any new layers (which means they are removed in v1)
  const removedLayers = layerIdsV2.filter((id) => !layerIdsV1.includes(id));
  if (removedLayers.length > 0) {
    console.log("REMOVED layers in v1:");
    console.log(removedLayers);
  }

  // Check if v2 has any missing layers (which means they are new in v1)
  const newLayers = layerIdsV1.filter((id) => !layerIdsV2.includes(id));
  if (newLayers.length > 0) {
    console.log("NEW layers in v1:");
    console.log(newLayers);
  }

  // Check if the order of layers has changed, detail which layers have changed
  // Take into account already reported new and missing layers, do not report them again
  const changedLayers = [];
  let indexV1 = 0;
  let indexV2 = 0;

  while (indexV1 < layersV1.length && indexV2 < layersV2.length) {
    const idV1 = layersV1[indexV1].id;
    const idV2 = layersV2[indexV2].id;

    if (newLayers.includes(idV1)) {
      indexV1++;
      continue;
    }

    if (removedLayers.includes(idV2)) {
      indexV2++;
      continue;
    }

    if (idV1 !== idV2) {
      changedLayers.push(idV1);
    }

    indexV1++;
    indexV2++;
  }

  if (changedLayers.length > 0) {
    console.log("CHANGED layer ORDER in v1:");
    console.log(changedLayers);
  }

  // Check the content of the matching layers (use layer id as key) has changed in any way
  // Layer is a multi-level object with various properties, so a deep comparison is needed
  const changedContentLayers = [];
  for (let i = 0; i < layersV1.length; i++) {
    if (
      newLayers.includes(layersV1[i].id) ||
      removedLayers.includes(layersV1[i].id)
    ) {
      continue;
    }

    const layerV1 = layersV1[i];
    const layerV2 = layersV2.find((layer) => layer.id === layerV1.id);

    if (JSON.stringify(layerV1) !== JSON.stringify(layerV2)) {
      changedContentLayers.push(layerV1.id);
    }
  }

  if (changedContentLayers.length > 0) {
    console.log("CHANGED CONTENT layer in v1:");
    console.log(changedContentLayers);
  }
}

// Execute the processing function
processFile(v1, v2);
