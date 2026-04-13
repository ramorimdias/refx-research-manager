import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const iconsDir = path.join(repoRoot, "src-tauri", "icons");
const publicDir = path.join(repoRoot, "public");
const sourceIcon = path.join(iconsDir, "app-icon.png");
const canonical32 = path.join(iconsDir, "32x32.png");
const canonical128 = path.join(iconsDir, "128x128.png");
const canonical256 = path.join(iconsDir, "128x128@2x.png");
const canonicalIcns = path.join(iconsDir, "icon.icns");
const canonicalIco = path.join(iconsDir, "icon.ico");
const canonicalPng = path.join(iconsDir, "icon.png");
const WINDOWS_ICON_INSET_RATIO = 0.1;

function runTauriIcon(inputIconPath, outputDir) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const tauriIcon = spawnSync(pnpmCommand, ["exec", "tauri", "icon", inputIconPath, "-o", outputDir], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });

  if ((tauriIcon.status ?? 1) !== 0) {
    process.exit(tauriIcon.status ?? 1);
  }
}

function createWindowsIconSource(inputIconPath, outputIconPath) {
  if (process.platform !== "win32") {
    return inputIconPath;
  }

  const powershellCommand = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Drawing",
    `$inputPath = '${inputIconPath.replace(/'/g, "''")}'`,
    `$outputPath = '${outputIconPath.replace(/'/g, "''")}'`,
    `$insetRatio = ${WINDOWS_ICON_INSET_RATIO}`,
    "$source = [System.Drawing.Image]::FromFile($inputPath)",
    "try {",
    "  $insetX = [Math]::Max(1, [int][Math]::Floor($source.Width * $insetRatio))",
    "  $insetY = [Math]::Max(1, [int][Math]::Floor($source.Height * $insetRatio))",
    "  $cropWidth = [Math]::Max(1, $source.Width - ($insetX * 2))",
    "  $cropHeight = [Math]::Max(1, $source.Height - ($insetY * 2))",
    "  $bitmap = New-Object System.Drawing.Bitmap $source.Width, $source.Height",
    "  try {",
    "    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
    "    try {",
    "      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality",
    "      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality",
    "      $graphics.Clear([System.Drawing.Color]::Transparent)",
    "      $destinationRect = New-Object System.Drawing.Rectangle 0, 0, $source.Width, $source.Height",
    "      $sourceRect = New-Object System.Drawing.Rectangle $insetX, $insetY, $cropWidth, $cropHeight",
    "      $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)",
    "      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)",
    "    } finally {",
    "      $graphics.Dispose()",
    "    }",
    "  } finally {",
    "    $bitmap.Dispose()",
    "  }",
    "} finally {",
    "  $source.Dispose()",
    "}",
  ].join("; ");
  const powershell = process.env.COMSPEC
    ? "powershell.exe"
    : "powershell";
  const result = spawnSync(
    powershell,
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", powershellCommand],
    { cwd: repoRoot, stdio: "inherit" },
  );

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  return outputIconPath;
}

if (!fs.existsSync(sourceIcon)) {
  console.error(`Missing source icon: ${sourceIcon}`);
  process.exit(1);
}

const tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "refx-tauri-icons-"));
const tempWindowsOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "refx-tauri-icons-win-"));
const windowsSourceIcon = path.join(tempWindowsOutputDir, "app-icon.windows.png");

runTauriIcon(sourceIcon, tempOutputDir);
const windowsIconSource = createWindowsIconSource(sourceIcon, windowsSourceIcon);
runTauriIcon(windowsIconSource, tempWindowsOutputDir);

const generatedFiles = new Map([
  [path.join(tempOutputDir, "32x32.png"), canonical32],
  [path.join(tempOutputDir, "128x128.png"), canonical128],
  [path.join(tempOutputDir, "128x128@2x.png"), canonical256],
  [path.join(tempOutputDir, "icon.icns"), canonicalIcns],
  [path.join(tempWindowsOutputDir, "icon.ico"), canonicalIco],
  [path.join(tempOutputDir, "icon.png"), canonicalPng],
]);

for (const iconPath of generatedFiles.keys()) {
  if (!fs.existsSync(iconPath)) {
    console.error(`Missing generated icon: ${iconPath}`);
    process.exit(1);
  }
}

fs.mkdirSync(iconsDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const [source, target] of generatedFiles.entries()) {
  fs.copyFileSync(source, target);
}

for (const [source, target] of [
  [canonical32, path.join(publicDir, "icon-light-32x32.png")],
  [canonical32, path.join(publicDir, "icon-dark-32x32.png")],
  [canonicalPng, path.join(publicDir, "iconHD.png")],
  [canonicalPng, path.join(publicDir, "apple-icon.png")],
]) {
  fs.copyFileSync(source, target);
}

for (const stalePath of [
  path.join(iconsDir, "64x64.png"),
  path.join(iconsDir, "StoreLogo.png"),
  path.join(iconsDir, "Square30x30Logo.png"),
  path.join(iconsDir, "Square44x44Logo.png"),
  path.join(iconsDir, "Square71x71Logo.png"),
  path.join(iconsDir, "Square89x89Logo.png"),
  path.join(iconsDir, "Square107x107Logo.png"),
  path.join(iconsDir, "Square142x142Logo.png"),
  path.join(iconsDir, "Square150x150Logo.png"),
  path.join(iconsDir, "Square284x284Logo.png"),
  path.join(iconsDir, "Square310x310Logo.png"),
  path.join(iconsDir, "android"),
  path.join(iconsDir, "ios"),
]) {
  if (fs.existsSync(stalePath)) {
    fs.rmSync(stalePath, { recursive: true, force: true });
  }
}

fs.rmSync(tempOutputDir, { recursive: true, force: true });
fs.rmSync(tempWindowsOutputDir, { recursive: true, force: true });

console.log("Generated Tauri icons from a single source PNG and applied a tighter Windows icon crop");
