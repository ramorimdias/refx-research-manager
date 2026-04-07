# App Tour Known Issue

Status: temporarily disabled on April 7, 2026.

## Symptom

- The app tour can freeze the installed desktop client when it reaches the Search step.
- In the broken state, the tour UI may not appear, but the app stops responding normally until the user navigates away, usually back to Settings.
- The same tour flow works in `dev`, so this is currently a packaged-client-only issue.

## What We Observed

- The failure was reported consistently after building and installing the client.
- The freeze was originally mistaken for the reader search step, but the persistent report was about the Search page step earlier in the walkthrough.
- Right now the safest assumption is that the packaged build handles route transition and/or target resolution differently from `dev` during this step.

## What We Already Tried

- Clearing the previous spotlight rectangle immediately on step changes.
- Preventing the invisible overlay from blocking pointer events across the whole app.
- Matching full routes, including query parameters, instead of only `pathname`.
- Moving the Search tour step off the live `/search` page and onto dedicated tour-only demo routes.
- Restoring the reader search step after an earlier mistaken removal.

## Current Workaround

- The tour is disabled behind `APP_TOUR_ENABLED` in `lib/app-tour.ts`.
- The Settings screen shows the tour as temporarily unavailable instead of launching it.

## Best Next Step

- Add targeted packaged-runtime logging inside `components/refx/app-tour-provider.tsx` around:
  - route transition to the Search step
  - target lookup for `search-query`
  - spotlight rect creation
  - step advancement when no target is found
- Reproduce only on an installed build and capture the exact route and target-resolution sequence.
