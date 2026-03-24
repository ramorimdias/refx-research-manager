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
console.log("Ensured Tauri PNG icons in src-tauri/icons");
