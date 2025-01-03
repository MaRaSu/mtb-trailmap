const fs = require("fs");
const path = require("path");

// Extract command line arguments
const [filePath] = process.argv.slice(2);

if (!filePath) {
  console.log("Usage: node script.js <file path>");
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
function processFile(filePath) {
  const jsonContent = readJSONFile(filePath);

  const header = ["id", "ways_only"];

  const items = jsonContent.layers.map((layer) => {
    const ways_only = layer.metadata?.["trailmap:ways_only"] || false;
    const item = [layer.id, ways_only];
    return item.join(",");
  });

  items.unshift(header.join(","));
  //console.log(items);

  const processedFilePath = path.join(
    path.dirname(filePath),
    path.basename(filePath, ".json") + "_ids_exported.csv"
  );
  //console.log(processedFilePath);

  // Write processed data back to the original file
  writeCSVFile(processedFilePath, items);

  console.log(`Processed file saved as: ${processedFilePath}`);
}

// Execute the processing function
processFile(filePath);
