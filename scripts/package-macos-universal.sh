#!/usr/bin/env bash

set -euo pipefail

APP_NAME="$(node -p "require('./src-tauri/tauri.conf.json').productName")"
ARM_TARGET="aarch64-apple-darwin"
X64_TARGET="x86_64-apple-darwin"
TARGET_ROOT="src-tauri/target"

ARM_APP="${TARGET_ROOT}/${ARM_TARGET}/release/bundle/macos/${APP_NAME}.app"
X64_APP="${TARGET_ROOT}/${X64_TARGET}/release/bundle/macos/${APP_NAME}.app"
UNIVERSAL_ROOT="${TARGET_ROOT}/universal-apple-darwin/release/bundle"
UNIVERSAL_MACOS_DIR="${UNIVERSAL_ROOT}/macos"
UNIVERSAL_DMG_DIR="${UNIVERSAL_ROOT}/dmg"
UNIVERSAL_APP="${UNIVERSAL_MACOS_DIR}/${APP_NAME}.app"
UPDATER_TARBALL="${UNIVERSAL_MACOS_DIR}/${APP_NAME}.app.tar.gz"
APP_ZIP="${UNIVERSAL_ROOT}/${APP_NAME}.app.zip"
DMG_PATH="${UNIVERSAL_DMG_DIR}/${APP_NAME}.dmg"

mkdir -p "${UNIVERSAL_MACOS_DIR}" "${UNIVERSAL_DMG_DIR}"
rm -rf "${UNIVERSAL_APP}"
rm -f "${UPDATER_TARBALL}" "${UPDATER_TARBALL}.sig" "${APP_ZIP}" "${DMG_PATH}"

ditto "${ARM_APP}" "${UNIVERSAL_APP}"

while IFS= read -r -d '' arm_file; do
  rel_path="${arm_file#${ARM_APP}/}"
  x64_file="${X64_APP}/${rel_path}"
  universal_file="${UNIVERSAL_APP}/${rel_path}"

  if [[ -f "${x64_file}" ]] && file "${arm_file}" | grep -q "Mach-O"; then
    lipo -create "${arm_file}" "${x64_file}" -output "${universal_file}"
  fi
done < <(find "${ARM_APP}" -type f -print0)

codesign --force --deep -s - "${UNIVERSAL_APP}"

tar -C "${UNIVERSAL_MACOS_DIR}" -czf "${UPDATER_TARBALL}" "${APP_NAME}.app"
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" || -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  pnpm exec tauri signer sign "${UPDATER_TARBALL}"
fi

ditto -c -k --sequesterRsrc --keepParent "${UNIVERSAL_APP}" "${APP_ZIP}"
hdiutil create -volname "${APP_NAME}" -srcfolder "${UNIVERSAL_APP}" -ov -format UDZO "${DMG_PATH}"

EXECUTABLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${UNIVERSAL_APP}/Contents/Info.plist")"
file "${UNIVERSAL_APP}/Contents/MacOS/${EXECUTABLE_NAME}"
