const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

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
const [filePath] = process.argv.slice(2);

if (!filePath) {
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

// Function to write Excel file
function writeExcelFile(filePath, data) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  workbook.views = [
    {
      x: 1000,
      y: 1000,
      width: 30000,
      height: 20000,
      firstSheet: 0,
      activeTab: 1,
      visibility: "visible",
    },
  ];
  const sheet = workbook.addWorksheet("MapStyle");

  try {
    sheet.addRow([
      "id_legacy",
      "id_orig",
      "id_new",
      "change",
      "",
      "category",
      "content",
      "content_detail",
      "maptype",
      "country",
      "source",
      "subtype",
      "",
      ...expectedMetadataKeys,
      "",
      "notes",
    ]);

    // Add shared formulas
    const newIdFormula = {
      formula:
        '_xlfn.CONCAT(F2,IF(NOT(ISBLANK(G2)),"-",""),G2,IF(NOT(ISBLANK(H2)),"-",""),H2,"-(",I2,"-",J2,"-",K2,IF(NOT(ISBLANK(L2)),"-hc",""),")")',
    };
    const sharedIdFormula = {
      formula: newIdFormula.formula,
      result: "",
      shareType: "shared",
      ref: "C2:C4270",
    };
    data[0][2] = sharedIdFormula;
    const compareFormula = { formula: 'IF(B2=C2, "", "NEW")', result: "" };
    const sharedChangeFormula = {
      formula: compareFormula.formula,
      result: "",
      shareType: "shared",
      ref: "D2:D4270",
    };
    data[0][3] = sharedChangeFormula;

    data.forEach((item) => {
      sheet.addRow(item);
    });

    // Formatting
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn(4).font = { color: { argb: "FFFF0000" }, bold: true };
    sheet.getCell("D1").font = { color: { argb: "FF000000" }, bold: true };
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 50;
    sheet.getColumn(3).width = 50;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 2;

    sheet.getColumn(6).width = 30;
    sheet.getColumn(7).width = 30;
    sheet.getColumn(8).width = 20;

    sheet.getColumn(9).width = 8;
    sheet.getColumn(10).width = 8;
    sheet.getColumn(11).width = 15;
    sheet.getColumn(12).width = 8;
    sheet.getColumn(13).width = 2;

    sheet.getColumn(14).width = 10;
    sheet.getColumn(15).width = 10;
    sheet.getColumn(16).width = 10;
    sheet.getColumn(17).width = 10;
    sheet.getColumn(18).width = 10;
    sheet.getColumn(19).width = 10;

    sheet.getColumn(20).width = 2;

    workbook.xlsx.writeFile(filePath);
  } catch (error) {
    console.error(`Error writing file to disk: ${error}`);
    process.exit(1);
  }
}

function splitLayerId(id) {
  //id is a string. Split string first by "-(" and process first part by splitting by "-"
  // then process the second part by removing ")" and splitting by "-"
  const parts = id.split("-(");
  const firstPart = parts[0].split("-");
  const secondPart = parts?.[1]?.replace(")", "")?.split("-") ?? [];
  return [firstPart, secondPart];
}

// Main function to process the file
function processFile(filePath) {
  const jsonContent = readJSONFile(filePath);

  validateJson(jsonContent);

  // Id & id formulas
  const items = jsonContent.layers.map((layer) => {
    const metadata = layer.metadata;
    const legacyId = metadata["trailmap:id_legacy"];
    const sharedIdFormula = { sharedFormula: "C2", result: "" };
    const sharedChangeFormula = { sharedFormula: "D2", result: "" };
    const item = [legacyId, layer.id, sharedIdFormula, sharedChangeFormula];
    item.push(undefined);

    // Id originating columns
    const splittedLayerId = splitLayerId(layer.id);
    const category = splittedLayerId[0];
    const mapType = splittedLayerId[1];
    item.push(category[0], category[1], category[2]);
    item.push(mapType[0], mapType[1], mapType[2], mapType[3]);

    // Metadata columns
    item.push(undefined);
    expectedMetadataKeys.forEach((key) => {
      const fullKey = `trailmap:${key}`;
      const value = metadata.hasOwnProperty(fullKey) ? metadata[fullKey] : "";
      item.push(value);
    });

    return item;
  });

  //console.log(items);

  const processedFilePath = path.join(
    path.dirname(filePath),
    path.basename(filePath, ".json") + "_export.xlsx"
  );
  //console.log(processedFilePath);

  // Write processed data back to the original file
  writeExcelFile(processedFilePath, items);

  console.log(`Processed file saved as: ${processedFilePath}`);
}

// Execute the processing function
processFile(filePath);
