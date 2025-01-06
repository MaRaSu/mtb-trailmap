const fs = require("fs");
const path = require("path");

// Extract command line arguments
const [csvPath, jsonPath, csvDelimiter] = process.argv.slice(2);

if (!csvPath || !jsonPath || !csvDelimiter) {
  console.log(
    "Usage: node script.js <id csv path> <style json path> <csv delimiter>"
  );
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
function processFile(csvPath, jsonPath, csvDelimiter) {
  // Read the csv file and json file
  let csvContent = fs.readFileSync(csvPath, "utf8");
  // Remove BOM character if it exists
  if (csvContent.charCodeAt(0) === 0xfeff) {
    console.log("BOM detected");
    csvContent = csvContent.slice(1);
  }

  const jsonContent = readJSONFile(jsonPath);

  // Split the csv content into an array of ids
  const layer_ids = csvContent
    .split("\n")
    .map((row) => row.split(csvDelimiter).map((col) => col.replace("\r", "")));
  //console.log(layer_ids);
  //console.log(jsonContent.layers);

  // Loop through each layer in the JSON content
  jsonContent.layers.forEach((layer) => {
    // Find the corresponding row in the layer_ids array
    const matchingRow = layer_ids.find((row) => row[0] === layer.id);

    // If a matching row is found and the second column is not empty, replace the id
    if (matchingRow && matchingRow[1]) {
      layer.id = matchingRow[1];
      layer.metadata = {...layer.metadata, 'trailmap:id_legacy': matchingRow[0]};
    } else {
      // If no matching row is found, log a warning
      console.warn(`No matching id found for layer: ${layer.id}`);
    }
  });

  const processedFilePath = path.join(
    path.dirname(jsonPath),
    path.basename(jsonPath, ".json") + "_new_ids.json"
  );

  console.log(processedFilePath);
  // Write the modified JSON content back to the file

  fs.writeFileSync(
    processedFilePath,
    JSON.stringify(jsonContent, null, 2),
    "utf8"
  );

  /*
  const layer_ids = jsonContent.layers.map((layer) => {
    return layer.id;
  });
  //console.log(layer_ids);

  const processedFilePath = path.join(
    path.dirname(filePath),
    path.basename(filePath, ".json") + "_ids.csv"
  );
  //console.log(processedFilePath);

  // Write processed data back to the original file
  writeCSVFile(processedFilePath, layer_ids);

  console.log(`Processed file saved as: ${processedFilePath}`);
	*/
}

// Execute the processing function
processFile(csvPath, jsonPath, csvDelimiter);
