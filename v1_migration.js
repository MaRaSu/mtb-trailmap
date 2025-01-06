const fs = require("fs");
const path = require("path");
const { json } = require("stream/consumers");

const sourceRename = [
  { current: "openmaptiles", new: "osm" },
  { current: "maastovektorikartta", new: "mml_topo" },
  { current: "rinnevarjostus", new: "hillshade" },
  { current: "ilmakuva", new: "mml_ortho" },
  { current: "ilmakuva2", new: "mml_ortho_kapsi" },
  { current: "lipas-reitit", new: "lipas_routes" },
  { current: "lipas-pisteet", new: "lipas_points" },
  { current: "kiinteisto-avoin", new: "mml_cadastre" },
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
  const sources = jsonContent.sources;

  // RENAME SOURCES
  let newSources = {};
  Object.keys(sources).forEach((key) => {
    const source = sources[key];
    const sourceRenameObj = sourceRename.find((obj) => obj.current === key);
    if (sourceRenameObj) {
      newSources[sourceRenameObj.new] = source;
    }
  });

  // Create a new array of layers with the new source names
  const newLayers = layers.map((layer) => {
    const sourceRenameObj = sourceRename.find(
      (obj) => obj.current === layer.source
    );
    if (sourceRenameObj) {
      layer.source = sourceRenameObj.new;
    }
    return layer;
  });

  // REMOVE TAUSTAKARTTA
  let filteredSources = {};
  Object.keys(newSources).forEach((source) => {
    if (!["taustakartta", "lipas-alueet"].includes(source))
      filteredSources[source] = newSources[source];
  });
  const filteredLayers = newLayers.filter(
    (layer) => layer.source !== "taustakartta"
  );

  // MIGRATE LAYER METADATA
  const finalLayers = filteredLayers.map((layer) => {
    const metadataKeys = Object.keys(layer.metadata);
    const newMetadata = {};

    metadataKeys.forEach((key) => {
      // if key string does not include "trailmap:", skip it
      if (!key.includes("trailmap:")) return;
      // Migrate high contrast to new logic
      if (key === "trailmap:mtb_high_contrast") {
        const hcValue = layer.metadata[key];
        if (hcValue === true) {
          const mtbValue = layer.metadata["trailmap:mtb"];
          if (mtbValue === true) {
            newMetadata["trailmap:high_contrast"] = "yes";
          } else {
            newMetadata["trailmap:high_contrast"] = "exclusive";
          }
        } else {
          newMetadata["trailmap:high_contrast"] = "no";
        }
      } else {
        newMetadata[key] = layer.metadata[key];
      }
    });

    if (layer.metadata["trailmap:mtb_high_contrast"] === undefined) {
      newMetadata["trailmap:high_contrast"] = "no";
    } else if (newMetadata["trailmap:high_contrast"] === "exclusive") {
      newMetadata["trailmap:mtb"] = true;
    }

    layer.metadata = newMetadata;
    return layer;
  });

  // Other cleanups
  delete jsonContent.id;
  const topMetadata = jsonContent.metadata;
  const newTopMetadata = {};
  Object.keys(topMetadata).forEach((key) => {
    if (key.includes("mapbox")) return;
    newTopMetadata[key] = topMetadata[key];
  });

  // Assign the new sources and layers to the JSON content
  jsonContent.metadata = newTopMetadata;
  jsonContent.sources = filteredSources;
  jsonContent.layers = finalLayers;

  // Write new JSON content to a new file
  const processedFilePath = path.join(
    path.dirname(jsonPath),
    path.basename(jsonPath, ".json") + "_migrated.json"
  );

  console.log(processedFilePath);

  fs.writeFileSync(
    processedFilePath,
    JSON.stringify(jsonContent, null, 2),
    "utf8"
  );
}

// Execute the processing function
processFile(jsonPath);
