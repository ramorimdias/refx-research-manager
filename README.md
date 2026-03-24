# Refx Research App (Next.js + Tauri v2)

Refx is now wired as a **local-first desktop app**: Next.js for UI + Tauri v2 for native desktop shell + SQLite persistence.

## What is already working

- Tauri v2 desktop shell integrated with Next.js static export (`out/`) for packaging.
- Local SQLite database initialization on startup.
- Default library seeding on first run.
- Desktop PDF import flow (native file picker, copies files to app data folder, creates DB rows).
- Local library/documents/notes data paths wired into the app state for desktop mode.
- Basic desktop reader page (`/reader/view?id=...`) that opens imported local PDFs and persists last page + last opened timestamp.

## What remains scaffolded

- Advanced annotation engine (highlight geometry, full-text PDF extraction).
- Full metadata extraction/OCR pipeline.
- Full note editing persistence (the save button in Notes editor is intentionally scaffolded).
- Some non-core pages still use placeholder/mock content.

---

## Prerequisites

### 1) Node + pnpm

- Node.js 20+
- pnpm 9+

### 2) Rust toolchain

Install via `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify:

```bash
rustc --version
cargo --version
```

### 3) Tauri v2 desktop build prerequisites

#### macOS

- Xcode Command Line Tools
- Apple developer signing setup only if you plan to sign/notarize production builds

```bash
xcode-select --install
```

#### Windows

- Microsoft C++ Build Tools (Visual Studio Build Tools)
- WebView2 runtime (normally present on Windows 11)

---

## Install dependencies

```bash
pnpm install
```

---

## Run in development

### Web preview only

```bash
pnpm dev
```

### Desktop app (Tauri dev)

```bash
pnpm tauri:dev
```

This will:
- start Next.js dev server (`http://localhost:3000`)
- launch Tauri desktop window

---

## Build production desktop bundles

```bash
pnpm tauri:build
```

This runs:
- `TAURI_ENV=1 pnpm build` (Next.js static export to `out/`)
- Tauri bundling using `src-tauri/tauri.conf.json`

Configured targets:
- `msi` (Windows installer)
- `dmg` + `app` (macOS)

Output location:
- `src-tauri/target/release/bundle/`

---

## Desktop data layout

In app data directory, Refx stores:

- `refx.db` (SQLite)
- `pdfs/<libraryId>/<documentId>.pdf`
- `thumbnails/`
- `exports/`
- `backups/`

---

## Useful local commands

```bash
# Build static frontend only (for Tauri packaging)
TAURI_ENV=1 pnpm build

# Tauri desktop dev
pnpm tauri:dev

# Tauri desktop bundle
pnpm tauri:build
```

---

## Known limitations

- Reader currently uses an iframe-based local PDF display foundation (page/zoom persisted); this is intentionally a transitional base toward deeper PDF tooling.
- Some advanced features/pages are still mock-backed while core library/document/note desktop paths are local-first.
- CI/network-restricted environments may fail Rust crate downloads; local development with internet access is expected.
