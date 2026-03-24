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

## Clone and sync the repo in Visual Studio Code (Windows)

If by “VS” you mean **VS Code**, this is the fastest workflow:

1. **Clone in VS Code UI**
   - Open VS Code.
   - `Ctrl + Shift + P` → run **Git: Clone**.
   - Paste your repository URL.
   - Choose a local folder.
   - Click **Open** when prompted.

2. **Open integrated terminal** in the cloned folder:

   ```powershell
   cd <your-cloned-folder>\v0-refx-research-app
   ```

3. **Install dependencies** after first clone:

   ```powershell
   pnpm install
   ```

4. **Create your branch** for work:

   ```powershell
   git checkout -b your-branch-name
   ```

5. **Sync latest changes from remote** (daily / before pushing):

   ```powershell
   git checkout main
   git pull origin main
   git checkout your-branch-name
   git rebase main
   ```

6. **Resolve conflicts** (if any), then continue:

   ```powershell
   git add .
   git rebase --continue
   ```

7. **Push your branch**:

   ```powershell
   git push -u origin your-branch-name
   ```

If you are using **Visual Studio (full IDE)** instead of VS Code, the equivalent flow is:
- Git menu → **Clone Repository**
- Use **Git Changes** / **Pull** to sync
- Use **Manage Branches** to create/switch branches

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

### Windows-only: step-by-step test + build for MSI

If you are building on a Windows machine and want to validate locally before sharing an installer, use this sequence:

1. **Install required tooling (one-time):**
   - Node.js 20+
   - pnpm 9+
   - Rust (`rustup`, includes `cargo`)
   - Visual Studio 2022 Build Tools with C++ workload
   - WebView2 Runtime

2. **Open terminal in the project root** (`v0-refx-research-app`) and install dependencies:

   ```powershell
   pnpm install
   ```

3. **Smoke-test the desktop app in dev mode:**

   ```powershell
   pnpm tauri:dev
   ```

   Check that:
   - the desktop window opens
   - navigation works
   - importing a PDF works
   - app restarts without DB errors

4. **Create a production MSI build:**

   ```powershell
   pnpm tauri:build
   ```

   This runs the configured static frontend build (`TAURI_ENV=1 pnpm build`) and then Tauri bundling.

5. **Find the generated Windows installer:**

   ```text
   src-tauri\target\release\bundle\msi\
   ```

   You should see an `.msi` file for the current app version.

6. **Installer validation checklist (recommended):**
   - Run the `.msi` installer.
   - Launch Refx from Start Menu.
   - Verify app opens with expected window title (`Refx - Research Library`).
   - Import at least one PDF and reopen app to confirm data persists.
   - Uninstall and reinstall to verify clean install behavior.

7. **If build fails, verify first:**
   - `cargo --version`, `rustc --version`
   - `pnpm --version`, `node --version`
   - Visual Studio Build Tools C++ workload is installed
   - You are building on Windows for MSI output

8. **Fix common Windows packaging errors (`icons/icon.ico` / `package.metadata`):**

   If you see errors similar to:

   - ``package.metadata does not exist``
   - ```icons/icon.ico not found; required for generating a Windows Resource file during tauri-build```

   run:

   ```powershell
   # Generates src-tauri/icons/*.png + src-tauri/icons/icon.ico
   # from public/icon-light-32x32.png
   pnpm tauri:icons

   # Then retry
   pnpm tauri:build
   ```

   Notes:
   - `tauri:dev` and `tauri:build` now run `tauri:icons` automatically before invoking Tauri.
   - The `package.metadata does not exist` line is usually informational; missing `icon.ico` is the real blocker.
   - `icon.ico` is generated locally by `tauri:icons` and is intentionally not committed.

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
