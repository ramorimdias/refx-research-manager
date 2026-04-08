#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONS_DIR="${REPO_ROOT}/src-tauri/icons"
SOURCE_ICON="${ICONS_DIR}/128x128@2x.png"
OUTPUT_ICON="${ICONS_DIR}/icon.icns"
ICONSET_DIR="$(mktemp -d "${TMPDIR:-/tmp}/refx-iconset.XXXXXX.iconset")"

cleanup() {
  rm -rf "${ICONSET_DIR}"
}

trap cleanup EXIT

if [[ ! -f "${SOURCE_ICON}" ]]; then
  echo "Missing source icon for macOS ICNS generation: ${SOURCE_ICON}" >&2
  exit 1
fi

resize_icon() {
  local size="$1"
  local output="$2"
  sips -s format png -z "${size}" "${size}" "${SOURCE_ICON}" --out "${output}" >/dev/null
}

resize_icon 16 "${ICONSET_DIR}/icon_16x16.png"
resize_icon 32 "${ICONSET_DIR}/icon_16x16@2x.png"
resize_icon 32 "${ICONSET_DIR}/icon_32x32.png"
resize_icon 64 "${ICONSET_DIR}/icon_32x32@2x.png"
resize_icon 128 "${ICONSET_DIR}/icon_128x128.png"
resize_icon 256 "${ICONSET_DIR}/icon_128x128@2x.png"
resize_icon 256 "${ICONSET_DIR}/icon_256x256.png"
resize_icon 512 "${ICONSET_DIR}/icon_256x256@2x.png"
resize_icon 512 "${ICONSET_DIR}/icon_512x512.png"
cp "${SOURCE_ICON}" "${ICONSET_DIR}/icon_512x512@2x.png"

iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICON}"
echo "Generated macOS icon at ${OUTPUT_ICON}"
