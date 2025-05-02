const fs = require("fs");
const path = require("path");

const packageJson = require("../../package.json");
const version = packageJson.version;
const buildPath = path.join(__dirname, "../../release-builds");

// Regex to detect any existing version number (X.Y.Z) in folder names
const versionRegex = /\d+\.\d+\.\d+/;

// Ensure release-builds folder exists before scanning
if (!fs.existsSync(buildPath)) {
  console.error(`Error: The folder ${buildPath} does not exist.`);
  process.exit(1);
}

fs.readdirSync(buildPath).forEach((folder) => {
  // If folder already contains ANY version number, skip renaming
  if (versionRegex.test(folder)) {
    console.log(`Skipping already versioned folder: ${folder}`);
    return;
  }

  const oldPath = path.join(buildPath, folder);

  // Apply renaming rules: Replace platform architecture labels
  let newName = folder
    .replace("win32", "windows")
    .replace("ia32", "32bit")
    .replace("x64", "64bit");

  const newPath = path.join(buildPath, `${newName}-${version}`);

  if (fs.statSync(oldPath).isDirectory()) {
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed: ${folder} -> ${newName}-${version}`);
  }
});