# Refx Word Add-in Submission Prep

This folder keeps the non-code assets and notes needed for hosted private beta, organizational deployment, and eventual Microsoft Marketplace review.

Current hosting plan:

- Public homepage: `https://refx.667764.xyz/`
- Word add-in: `https://refx.667764.xyz/word/`
- Privacy: `https://refx.667764.xyz/privacy`
- Terms: `https://refx.667764.xyz/terms`
- Support: `https://refx.667764.xyz/support`

## Current Readiness

- Private sideload / controlled beta: ready after `https://refx.667764.xyz/word/` is deployed and tested.
- Organizational deployment: likely ready after tenant admin validation.
- Public Marketplace: not final until the local desktop bridge dependency is accepted in the submission story or replaced with a broader supported integration path.

## Product Summary

Refx for Word connects Microsoft Word to the user's local Refx desktop research library so citations can be inserted from a selected My Work, refreshed globally, and rebuilt into a numeric reference table.

## Marketplace Short Description

Insert Refx references into Word and refresh citation numbering automatically.

## Marketplace Long Description Draft

Refx for Word is a companion add-in for Refx Research Manager. It helps researchers cite references attached to a selected Refx "My Work" document directly inside Microsoft Word.

The add-in inserts citations into Word content controls and stores stable citation state in the document, so citation numbers can be refreshed globally when references are inserted, deleted, or moved. It can rebuild a numeric reference table and optionally order that table by first appearance in Word or by the current Refx reference order.

The Refx desktop app must be installed and running on the same computer so the add-in can read the user's local Refx library through the local companion bridge.

## Companion-App Requirement Statement

Refx for Word is not a standalone citation manager. It is a companion to the Refx desktop app. Users must open Refx desktop locally before using the Word add-in. The add-in connects to the local bridge at `http://127.0.0.1:38474`.

## Support Statement

Support URL: `https://refx.667764.xyz/support`

Support should cover:

- Installing or sideloading the Word add-in.
- Opening the Refx desktop app before using the add-in.
- Troubleshooting the disconnected bridge banner.
- Repairing citation state in Word.

## Known Limitations

- Desktop Word is the supported target for beta use.
- The add-in requires the Refx desktop app to be open on the same computer.
- The current bridge URL is local: `http://127.0.0.1:38474`.
- Word for the web is not recommended for this citation workflow because the add-in depends on stable content-control and custom XML behavior.
- Grouped citation state is supported by the refresh engine, but the beta UI inserts one reference at a time.

## Reviewer Test Notes

1. Install and open Refx desktop.
2. Confirm the local bridge responds at `http://127.0.0.1:38474/health`.
3. Open Word desktop.
4. Install or deploy `manifest.production.xml`.
5. Open the Refx task pane from the References tab.
6. Confirm the task pane shows the bridge as connected.
7. Choose one My Work from the dropdown.
8. Insert reference A, then B, then A again.
9. Click `Refresh citations`; expected labels are `[1]`, `[2]`, `[1]`.
10. Insert another reference between A and B.
11. Click `Refresh citations`; expected numbering is recomputed in document order.
12. Click `Rebuild table`; expected reference table is inserted at the end of the document.
13. Close and reopen the document, then click `Repair`; expected state is restored from document XML.
14. Close Refx desktop and click `Sync Refx`; expected: disconnected banner and actionable error, no crash.

## Screenshots Checklist

- Hosted production task pane loaded from `/word/`.
- Task pane connected to Refx desktop.
- Disconnected bridge banner.
- Companion card showing bridge URL and linked work status.
- My Work dropdown with references loaded.
- Inserted citations in Word.
- Rebuilt reference table.
- Options panel with citation style choices.

## Icon Checklist

Current add-in icons:

- `public/assets/icon-16.png`
- `public/assets/icon-32.png`
- `public/assets/icon-64.png`
- `public/assets/icon-80.png`

Before Marketplace submission, verify current Microsoft listing image requirements in Partner Center and add any required store logos/screenshots.

## Release Checklist

- `pnpm --dir word-addin manifests`
- `pnpm --dir word-addin build:production`
- Deploy `word-addin/dist/` to `https://refx.667764.xyz/word/`.
- Publish homepage at `https://refx.667764.xyz/`.
- Publish privacy, terms, and support pages.
- Verify production URLs load without auth, redirects to login, or Cloudflare challenge pages.
- Verify `manifest.production.xml` points only to HTTPS production URLs.
- Validate the manifest with Microsoft tooling.
- Test Word desktop on Windows and macOS.
- Test bridge offline state.

## Submission Readiness Checklist

- Production HTTPS add-in URL available.
- Production manifest generated.
- Support page public.
- Privacy page public.
- Terms page public.
- Reviewer can access Refx desktop build and sample library.
- Reviewer notes explain the local companion bridge.
- Word desktop support story is explicit.
- Word web is not over-claimed.
