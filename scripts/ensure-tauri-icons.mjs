import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePng = path.join(repoRoot, "public", "iconHD.png");
const iconsDir = path.join(repoRoot, "src-tauri", "icons");

if (!fs.existsSync(sourcePng)) {
  console.error(`Missing source icon: ${sourcePng}`);
  process.exit(1);
}

fs.mkdirSync(iconsDir, { recursive: true });

// Keep PNG assets for Tauri
const pngTargets = ["32x32.png", "128x128.png", "128x128@2x.png"];
for (const fileName of pngTargets) {
  fs.copyFileSync(sourcePng, path.join(iconsDir, fileName));
}

// Do NOT generate a fake ICO from a 32x32 PNG.
// Instead, preserve an existing valid icon.ico if it is already committed.
const icoPath = path.join(iconsDir, "icon.ico");
if (!fs.existsSync(icoPath)) {
  console.error(
    `Missing valid Windows ICO at ${icoPath}. Create and commit a proper multi-size icon.ico first.`,
  );
  process.exit(1);
}

console.log("Ensured Tauri icons in src-tauri/icons");
