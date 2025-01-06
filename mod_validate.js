function splitLayerId(id) {
  //id is a string. Split string first by "-(" and process first part by splitting by "-"
  // then process the second part by removing ")" and splitting by "-"
  const parts = id.split("-(");
  const firstPart = parts[0].split("-");
  const secondPart = parts?.[1]?.replace(")", "")?.split("-") ?? [];
  return [firstPart, secondPart];
}

function validateJson(jsonContent) {
  const layers = jsonContent.layers;

  // Find any duplicate layer ids
  const layerIds = layers.map((layer) => layer.id);
  const duplicates = layerIds.filter(
    (id, index) => layerIds.indexOf(id) !== index
  );
  console.log("Duplicate layer ids: ", duplicates);

  //
  // Id mismatch with layer properties
  //
  jsonContent.layers.forEach((layer) => {
    const splittedLayerId = splitLayerId(layer.id);
    const category = splittedLayerId[0];
    const mapType = splittedLayerId[1];
    if (mapType.length === 0) {
      console.log(`Invalid layer id: ${layer.id}`);
      return;
    }
    const idSource = mapType[2];
    const idSubtype = mapType[3];
    const idHc = idSubtype === "hc";

    const metadata = layer.metadata;

    // Source
    if (layer.source !== idSource && idSource !== "nosource") {
      console.log(`Source mismatch: ${layer.id}`);
    }

    // High contrast
    if (idHc) {
      if (metadata["trailmap:high_contrast"] !== "exclusive") {
        console.log(`High contrast mismatch: ${layer.id}`);
      }
    }
  });
}

module.exports = validateJson;
