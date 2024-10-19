const fs = require("fs");
const path = require("path");

// Extract command line arguments
const [csvPath, jsonPath] = process.argv.slice(2);

if (!csvPath || !jsonPath) {
  console.log("Usage: node script.js <id csv path> <style json path>");
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

// Main function to process the file
function processFile(csvPath, jsonPath) {
  // Read the csv file and json file
  const csvContent = fs.readFileSync(csvPath, "utf8");
  const jsonContent = readJSONFile(jsonPath);

  // Split the csv content into an array of ids
  const layer_ids = csvContent
    .split("\n")
    .map((row) => row.split(";").map((col) => col.replace("\r", "")));
  //console.log(layer_ids);

  // Loop through each layer in the JSON content
  jsonContent.layers.forEach((layer) => {
    // Find the corresponding row in the layer_ids array
    const matchingRow = layer_ids.find((row) => row[0] === layer.id);

    // If a matching row is found and the second column is not empty, replace the id
    if (matchingRow && matchingRow[1]) {
      layer.id = matchingRow[1];
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
processFile(csvPath, jsonPath);
