# Campus Tree Walk upgrade

See [MIDNIGHT-EXPLORER.md](MIDNIGHT-EXPLORER.md) for the current premium UOW styling,
global vector buildings, photo crops and latest QA. Notes below retain the earlier
walking implementation and migration history.

The current renderer is now MapLibre GL JS. See [MAPLIBRE-MIGRATION.md](MAPLIBRE-MIGRATION.md) for the migration, restored original card and current verification. Earlier phase notes below describe the preserved Leaflet baseline.

Implemented in the supplied `treewalk5` checkout on 11 November 2026. The brief calls the predecessor `treewalk4`; no separate checkout was created. This remains a buildless, static Leaflet application suitable for GitHub Pages. No runtime dependencies were added.

## Simplification pass — current interface

The interface now prioritizes **start a walk → find a tree → mark visited**. This pass supersedes the navigation-strip and always-visible browser layouts described in the original phase notes below.

- New visitors see **Start a 15-minute walk**, with **Change walk** and **Browse trees** below it. The sheet adapts to keep those actions visible. Existing active/paused sessions reopen with **Continue your walk**; a saved route preview remains a preview.
- Next-stop guidance lives inside the same sheet. Peek shows the tree, walking distance/time, one primary action and Skip. View tree expands the photo and features; Mark visited becomes the main action in expanded view or after stable arrival. Arrival text appears inline. Visit status always requires an explicit action.
- Search and All/Nearby/Unvisited/Visited filters appear only in Browse trees, which covers the full tree collection. Walking details show three identifying features. Longer information, links, Find on map and previous/next actions sit under More about this tree.
- Only Location and Map tools float over the map. Map tools contains zoom, route fit, satellite and Outdoor Map. Resume follow appears only when relevant. The walk menu contains Pause, Show route, Browse trees, Finish and Settings.
- Saving is automatic. Pause returns to Continue your walk, Finish opens a compact summary, and Done for now leaves progress saved. Welcome remains available through Settings and no longer opens automatically.
- Changed files: `index.html`, `src/walk-experience.js`, `src/walk.css`, `src/walk-core.js`, and their existing tests. Routing, stable IDs, GPS handling, images, settings and storage keys remain compatible.

Verification includes six Node test cases and the Chromium responsive suite, plus checks of visible menu actions, the new-visitor default, restored Continue action, browse/detail/back transitions, one-sheet navigation containment, View tree without visitation, Skip updating details, and inline arrival marking. Device-specific limits below still apply.

## Phase 1 — Mobile interface

**Implemented:** Peek, Half and Expanded sheet states, pointer dragging and keyboard resizing; fluid dimensions derived from the visual viewport, safe areas and measured navigation content; panel-aware camera positioning; a compact route chooser; search and Walk Stops/Nearby/Unvisited/Visited filters; keyboard-operable cards with thumbnails, scientific names, walking distances and visit status; larger detail images, identifying features, Find on Map, visit toggles and previous/next actions. Controls remain visible. Settings escape sheet clipping. Short landscape layouts reflow the map toolbar horizontally.

**Files:** `index.html`, `src/walk.css`, `src/walk-experience.js`.

**Verification:** Chromium checks passed at 320, 347, 375, 390, 411, 430, 560, 768, 900, 1024, 1280 and 1440 CSS pixels, each at 430 and 844 pixels high. A further 35-width sweep from 320 through 898 pixels passed. No viewport or panel overflow was found. Touch dragging, keyboard controls, navigation/sheet separation, Settings at Peek and 200% text sizing passed. Screenshots were inspected during development.

**Limits / next improvements:** Real-device safe areas, virtual keyboard behavior, VoiceOver and TalkBack still need field testing. On very short screens or at large text sizes, the guidance strip and toolbar scroll within their available space. Confirm comfortable use while holding a phone outdoors before release.

## Phase 2 — Walking experience

**Implemented:** Quick Walk (~15 minutes), Casual Walk (~30 minutes), Full Walk and Explore Nearby. Selection reuses the campus graph, path snapping and shortest-path cache, with a walking speed of 72 metres/minute and 90 seconds per stop. A manual starting tree works without GPS; a reliable GPS fix can supply the start. Routes are one way. Stop selection stops before exceeding a short walk's budget; an unreachable budget produces an explanatory empty state.

Walking Mode provides next-tree name, route stop number, distance, remaining ETA, Show Route, Skip, Pause/Resume and Resume Follow. Direction is explicitly a direct bearing, distinct from mapped paths; relative device orientation is never presented as a compass. Arrival defaults to 30 metres, adjustable from 15–60 metres, and requires three accurate, separated, fresh fixes spanning at least four seconds. Arrival offers Details and Mark Visited and never changes visit status automatically.

Manual map gestures pause Follow Me. Camera movement ignores small position changes. Route rendering is limited by elapsed time and meaningful displacement. A sustained departure beyond the accuracy-adjusted corridor triggers a debounced reorder of the remaining selected stops. Skipping also reorders from the current origin. Pausing stops GPS; resuming in the same page can restart previously enabled GPS through the user's Resume action. Backgrounding pauses the walk.

Visited/skipped trees, mode, route, target, manual position, elapsed time and distance persist under `uowTreeWalkSessionV1`. Refresh restores a paused walk with GPS off. Stable keys, rather than route-order numbers, identify saved trees. The summary includes visits/progress, skipped trees, active elapsed time, approximate GPS distance (or a path estimate between confirmed stops), Resume Later, Continue Exploring and Start New Walk.

**Files:** `index.html`, `src/walk-core.js`, `src/walk-experience.js`, `src/leaflet-simple-locate_v2.js`.

**Verification:** The default Bangalow Palm start selected 7 stops / ~14 minutes for Quick Walk, 15 / ~29 minutes for Casual Walk, and all 49 / ~116 minutes for Full Walk. Both short routes included stop time and stayed within budget. Browser checks passed for mode changes, skip, pause/resume, saved target and progress restoration, stable-key restoration after reordering, manual visitation, arrival actions, manual-pan follow cancellation, minor-drift rejection and sustained-departure rerouting. Pure helper tests cover budget limits, impossible budgets, scoped progress, malformed saved data and arrival accuracy/freshness.

**Limits / next improvements:** Time is approximate and varies with walking pace and time spent observing trees. The heuristic favors nearby stops rather than globally optimizing a tour. Rerouting retains selected stops and can exceed the original time estimate after a detour. Footpath data does not provide turn-by-turn instructions, closures, current path conditions or accessibility guarantees. Calibrate arrival and rerouting with real campus walks, especially under tree cover. Consider explicit permanent Tree IDs in the CSV if names or coordinates will be edited; current fallback keys combine name and coordinates and survive row reordering.

## Phase 3 — Outdoor usability and media

**Implemented:** Dark and high-contrast Outdoor Map themes, readable route/marker colors, restrained red accents, visible focus, browser zoom, reduced motion, accessible names and modal keyboard handling. Added 160, 320, 640 and 1280-pixel WebP variants, responsive detail sources, lazy loading, asynchronous decoding and readable missing-image fallbacks. Cards use small square thumbnails. Full-resolution originals load only when explicitly opened. Standard browser caching replaces retained full-resolution Blob URLs.

The original CARTO endpoint visibly returned an API-key watermark during review. [CARTO now requires a key](https://carto.com/basemaps/apikey/). The default uses standard OpenStreetMap tiles, with a CSS treatment applied only to dark raster tiles, and normal colors outdoors. UOW overlays and the satellite option remain. Attribution is kept above the sheet. Tile requests use normal browser caching and no offline prefetch, following the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

**Files:** `src/walk.css`, `src/walk-experience.js`, `index.html`, `photos/optimized/` (196 WebP files plus manifest), `tools/optimize-images.py`.

**Verification:** All 49 original image references and all 196 variants exist. Variants total about 9.6 MB versus 495.4 MB for the originals; all thumbnails together total about 361 KB. Browser checks passed for theme changes, lazy/responsive media and failed-image fallback. The optimizer requires Pillow only when regenerating assets; the website has no image-processing dependency.

**Limits / next improvements:** The source images include supplied informational artwork, so thumbnails inherit that content. Dedicated tree-photo crops would improve recognition. WebP was chosen for broad compatibility; AVIF is not generated. Check sunlight readability on actual phones. The final automated viewport sweeps stub external OSM raster responses to avoid automated tile traffic; actual basemap detail still needs a normal interactive browser/device check.

## Phase 4 — Reliability and performance

**Implemented:** Fixed shortest-path cache direction, prevented GPS origins sharing tree snap-cache entries, capped path-cache growth, scoped progress to the selected route, separated stable identities from route positions, validated saved data and retained the existing settings key/defaults. Startup waits for the walking layer before initializing a loaded tour. CSV encoding was normalized from Windows-1252 to UTF-8 without changing botanical content.

GPS denial/unavailability, inaccurate fixes, stale/unavailable compass data, missing photos, path-data failure, tree-data failure, tile errors, offline transitions and unavailable localStorage have user-facing fallbacks. Temporary GPS failure leaves the watch able to recover. Heading changes update the indicator without route redraws. GPS marker icons are reused; decorative continuous GPS pulsing was removed. No device permission is requested on page load.

**Files:** `index.html`, `src/leaflet-simple-locate_v2.js`, `src/walk-core.js`, `src/walk-experience.js`, `src/trees.csv`, `tests/walk-core.test.cjs`, `tools/browser-smoke.mjs`, `.gitignore`.

**Verification:** Five dependency-free Node test cases passed. The Chromium suite passed real geolocation API permission denial/retry with simulated fixes, temporary-error recovery, absolute/relative compass handling, legacy settings toggles, path-cache reversal, missing media, route departure and saved-session restoration. No runtime JavaScript exceptions occurred. Syntax checks and `git diff --check` passed. Static checks confirmed no old Rec/Near labels, removed path button, Rand label or zoom above 19, and confirmed the SimpleLocate reference and browser zoom support.

**Limits / next improvements:** Physical iOS Safari and Android Chrome were unavailable. Compass accuracy, background suspension, permission prompts, GPS drift, distance totals and battery consumption were simulated rather than measured in the field. This is not a fully offline application: CDN libraries, uncached raster tiles, photos and a fresh page load can require a connection. Loaded campus data continues working through a connection loss. Consider self-hosting the existing small libraries and an explicitly licensed offline map source if full offline use becomes a requirement.

## Reproduce checks

Run from the repository root:

```powershell
node --test tests/walk-core.test.cjs
node --check src/walk-core.js
node --check src/walk-experience.js
node --check src/leaflet-simple-locate_v2.js
py tools/optimize-images.py
```

For browser regression checks, start a local static server on `127.0.0.1:8765` and an isolated headless Chromium instance with remote debugging on `9222`, then run:

```powershell
node tools/browser-smoke.mjs
```

The browser harness uses Node's built-in WebSocket and Chromium DevTools Protocol, with no Playwright/Puppeteer dependency. Temporary browser profiles and screenshots go in ignored `.qa/`. Serve the app over HTTP locally or HTTPS on GitHub Pages; browser fetch and device-permission restrictions make `file://` unsuitable for complete testing.
