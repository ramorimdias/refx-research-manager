# Desktop Workflows

## Manual build-only workflows

- `Build Windows`: builds the Windows app only and uploads the installer artifacts to Actions as `windows-build`.
- `Build macOS Intel`: builds the Intel-only macOS app only and uploads the artifacts to Actions as `macos-build-x86_64`.
- `Build macOS`: builds the universal macOS app only and uploads the artifacts to Actions as `macos-build-universal`.

## Manual workflows

- `Release Windows App`: creates or reuses the `v<version>` tag, builds the Windows release, uploads the Windows updater assets, and refreshes `latest.json`.
- `Release macOS Universal`: creates or reuses the `v<version>` tag, builds the universal macOS app, uploads the `.dmg` plus updater tarball/signature, and refreshes `latest.json`.
- `Release Desktop Apps`: runs the shared release pipeline for both platforms in one go.

All three workflows share the same reusable release engine in `.github/workflows/release-platform.yml`, so versioning, tagging, asset upload, and updater-manifest generation stay aligned.

## macOS updater notes

- The universal macOS release publishes one `.app.tar.gz` updater bundle and reuses it for both `darwin-x86_64` and `darwin-aarch64` in `latest.json`.
- If you release only one platform for an existing version tag, the workflow downloads the current `latest.json` first and merges the new platform entry into it. That keeps the sibling platform updater entry from being lost.

## macOS auto-update smoke test

1. Install an older packaged macOS build on the test machine from `/Applications`.
2. Run `Release macOS Universal` with a higher semver, or `Release Desktop Apps` if you want both platforms together.
3. Wait for the workflow to publish the GitHub release assets:
   `Refx.app.tar.gz`, `Refx.app.tar.gz.sig`, `Refx.dmg`, and `latest.json`.
4. Open the older app on macOS and go to Settings > Check for updates.
5. Confirm the app sees the new version, downloads it, restarts, and reports the new version in Settings.

If the update check fails, inspect the release assets first. On macOS the updater specifically needs the `.app.tar.gz`, its `.sig`, and a `latest.json` entry for the machine architecture.
