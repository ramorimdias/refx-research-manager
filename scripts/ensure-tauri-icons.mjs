import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePng = path.join(repoRoot, "public", "icon-light-32x32.png");
const iconsDir = path.join(repoRoot, "src-tauri", "icons");

if (!fs.existsSync(sourcePng)) {
  console.error(`Missing source icon: ${sourcePng}`);
  process.exit(1);
}

fs.mkdirSync(iconsDir, { recursive: true });

const pngTargets = ["32x32.png", "128x128.png", "128x128@2x.png"];
for (const fileName of pngTargets) {
  fs.copyFileSync(sourcePng, path.join(iconsDir, fileName));
}

// Windows Tauri packaging expects an .ico asset for winres.
const pngBytes = fs.readFileSync(sourcePng);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon type
header.writeUInt16LE(1, 4); // image count

const entry = Buffer.alloc(16);
entry[0] = 0; // width (0 means 256)
entry[1] = 0; // height (0 means 256)
entry[2] = 0; // color palette
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(pngBytes.length, 8); // image size
entry.writeUInt32LE(6 + 16, 12); // image offset

const icoBytes = Buffer.concat([header, entry, pngBytes]);
fs.writeFileSync(path.join(iconsDir, "icon.ico"), icoBytes);

console.log("Ensured Tauri icons in src-tauri/icons (png + ico)");
