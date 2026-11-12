# MapLibre migration

**Current implementation:** the subsequent [Midnight Explorer restyle](MIDNIGHT-EXPLORER.md)
supersedes the local-building workflow and original basemap appearance described in
this historical migration report. The Helsinki reference image was supplied later
and informed that restyle. Local building data is no longer loaded at runtime.

Implemented in the supplied `treewalk5` checkout on 11 November 2026. The request names the earlier application `treewalk4`; this migration upgrades the existing checkout and retains its walking sessions and data.

## Preserved baseline and current branch

- `backup/leaflet-walking-20261111` contains the working Leaflet version, committed as `3788300` before migration.
- `maplibre-migration` contains the replacement. No merge, publication or hosting change is performed.
- The original tree-detail implementation in Git commit `53655e6` supplied the structural reference. The request's attachment directory contained the pasted brief only, with no screenshot. Layout matching therefore follows the explicit requirements and original HTML/CSS; pixel comparison with the missing screenshot was unavailable.

## Phase 1 — Native basemap and overlay rendering

Added `src/map-view.js`, whose `CampusMap` owns a single native MapLibre map and cached GeoJSON sources. Pinned MapLibre GL JS **5.24.0**, the current 5.x release verified during implementation. Its browser bundle works without a build step. No renderer adapter, framework, API key or paid service was added.

Three selectable, persisted basemaps are available in Map tools:

| Basemap | Source | Rendering |
| --- | --- | --- |
| Dark, default | OpenFreeMap Dark | Native vector style |
| Light / Outdoor | OpenFreeMap Positron | Native vector style |
| Aerial | NSW Spatial Services public NSW Imagery | 256-pixel Web Mercator raster tiles, `{z}/{y}/{x}` |

Style switching preserves the map instance, camera, sources, selected/visited state, GPS and route. App sources are restored on `style.load`; a style-fetch failure leaves the current map intact. OpenFreeMap supplies its source attribution. NSW imagery includes the service's copyright and external imagery credits. Attribution remains visible above the sheet and outside the desktop sidebar. No imagery prefetch or tile export feature is added.

Verified the renderer independently in Chromium before integrating the walking app, including the real OpenFreeMap style, paths, tree layer and all 60 building footprints. Four geometry/source tests cover building-height derivation, source-data immutability, GPS geometry and the public basemap configuration.

References: [OpenFreeMap setup](https://openfreemap.org/quick_start/), [MapLibre API](https://maplibre.org/maplibre-gl-js/docs/), [NSW service metadata](https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer?f=pjson), [NSW imagery description and attribution licence](https://data.nsw.gov.au/data/dataset/nsw-imagery).

## Phase 2 — Walking, routing, trees and GPS

The CSV parser, canonical trees, graph construction, snapping, shortest-path cache, route budgets, ETA and arrival calculations remain in place. GeoJSON sources/layers now render trees, native clusters, direct/path route segments, repeated paths/count labels, endpoints, nearby labels, GPS position, accuracy and heading. Selected and visited trees use native feature state; there is no collection of DOM map markers. One-point graph legs are not emitted as invalid LineStrings.

`src/location-tracker.js` replaces the renderer-dependent geolocation plugin. It retains one geolocation watch, one compass listener, explicit permission actions, geofencing and error callbacks. Repeated starts share the existing watch. Pause clears the sensors; queued fixes after stop are ignored. Absolute compass data is required; poor/relative readings are rejected. GPS geometry updates are coalesced during heading changes, and route redraws retain their existing time/displacement threshold.

Quick, Casual, Full and Nearby walks, skip, stable arrival, Follow Me, manual-pan follow cancellation, rerouting, pause/resume, summary and saved progress remain available. The direct arrow is explicitly distinct from footpath routing and follows the camera orientation when no compass is available.

Compatibility is retained for:

- `uowTreeWalkSessionV1`: route, stable tree keys, visits, skips, target, manual position, distance and elapsed time.
- `uowTreeWalkCustomSettings`: existing enabled-by-default settings.
- `uowTreeWalkWalkingPreferences`: arrival threshold and legacy Outdoor selection.
- New `uowTreeWalkMapSettingsV1`: basemap and 3D selection. Existing Outdoor preference is respected when no new map settings exist.

Integration checks cover actual native cluster expansion and tree-layer clicks, all route budgets, nearby-label toggles, visits, arrival without auto-visiting, GPS denial/retry/weak accuracy, compass fallback, Follow Me and sustained-departure rerouting. GPS active-watch count stays at one across all basemap changes.

## Phase 3 — Original UOW tree-detail card

Restored the original card through `index.html` and `src/tree-card.css`:

- Compact UOW Tree Walk branding, REC/NEAR, Settings, progress, walking distance and ETA.
- Rounded Back to Tour List opposite GPS status.
- Bold common name, italic scientific name and right-aligned green route-stop badge.
- Complete rounded poster, preserving its intrinsic ratio with `object-fit: contain`.
- ABOUT card with Family and Features in two-column rows.
- MORE INFO with compact link pills and a full-width green Mark as Visited button at the bottom.

Poster enlargement, visit toggling, Find on map and previous/next interactions remain. Stop badges use the current route position; off-route trees say Explore rather than inventing a stop number. The compact next-stop strip remains in the sheet at Peek; expanded walking views show the restored card. The Settings icon opens walk options while navigating, including access to Settings.

Verified card structure, badge/order consistency, full poster ratio, image enlargement/Escape, browse/back navigation and fluid layout. Original source posters and all responsive WebP assets are reused unchanged.

## Phase 4 — Native 2D/3D and buildings

The map control group includes a small 3D/2D toggle. 2D resets pitch and bearing to zero and disables gesture/keyboard rotation while preserving keyboard panning/zoom. 3D uses a 48-degree native perspective with user rotation and pitch up to 60 degrees. Reduced-motion settings bypass the transition. There is no CSS perspective imitation or second map instance.

Building geometry is reused from `buildings.geojson`:

| Height source | Rule | Campus features |
| --- | --- | --- |
| Measured `height`, if supplied | Metres, used directly | None in current data |
| `building:levels` | Approximate 3 metres per storey | 34 |
| Missing height and levels | Approximate 9 metres | 26 |

`ele` is ground elevation and is never treated as building height. Derived features carry `height_estimated` and `height_basis`; source GIS files are not changed. Native fill extrusions appear in 3D, with flat footprints in 2D. Routing, trees and GPS remain in their native overlay layers above the basemap.

**Terrain is off.** No DEM was supplied. Future integration should add a real licensed `raster-dem` source and reapply native `map.setTerrain` from the renderer's style-restoration path. No artificial terrain or elevation is generated.

Live-basemap tests verified retained camera (within floating-point coordinate tolerance), selected tree, visited/skipped stops, route, GPS and watch count in both perspectives. Tests also verify north-up 2D, keyboard behavior and non-default basemap/3D restoration after reload.

## Phase 5 — Reliability, cleanup and validation

Removed the Leaflet scripts, marker-cluster plugin, renderer-specific CSS and obsolete `src/leaflet-simple-locate_v2.js`. There are no CARTO or Esri World Imagery dependencies. `tools/browser-smoke.mjs` remains a compatible command alias for the native MapLibre test suite. Updated `AGENTS.MD` for the current architecture.

Performance measures include native GeoJSON clustering/layers, feature-state updates, cached route geometry across style changes, change detection before source updates, coalesced compass rendering, at most two workers, capped pixel ratio, no decorative render loop and no duplicate GPS watch. Physical battery use and hardware GPU performance have not been benchmarked.

Graphics failures have two paths:

- Real context loss pauses map rendering and displays a recovery notice while tree/session data remains available. Restoration waits for the rebuilt style before adding sources and restores cached overlays.
- If WebGL or the map library is unavailable, the map area explains the limitation; tree browsing, walking planning, visit state and saved progress remain usable. A Retry map action is available. This fallback does not introduce another renderer.

Validation:

- **13 Node test cases**: route budgets, impossible starts, stable-key restoration, preview state, scoped progress, arrival freshness/accuracy, source configuration, building heights, GPS geometry, single-watch lifecycle and compass reliability.
- Native Chromium checks: three live basemaps, camera/state retention, 2D/3D, cluster expansion, tree clicks, card/poster consistency, image enlargement, search, settings, weak/denied GPS, compass, arrival, follow, skip/reroute, summaries and persistence.
- 59 viewport layouts, including 320/375/390/430 pixels, tablet/desktop and landscape, plus 200% text sizing and actual touch-drag events. The sweep uses a simple background style to avoid repeated automated public tile requests; native app sources/layers still render. Live basemaps are tested separately.
- Forced real WebGL loss/restoration and a separate no-WebGL page load.
- Simulated basemap HTTP failure and missing-image fallback.
- Script syntax, local asset references, dependency cleanup and `git diff --check`.

## Files changed

Main implementation: `index.html`, `src/map-view.js`, `src/location-tracker.js`, `src/walk-experience.js`, `src/walk.css`, `src/tree-card.css`.

Tests/tooling: `tests/map-view.test.cjs`, `tests/location-tracker.test.cjs`, `tools/cdp-client.mjs`, `tools/maplibre-smoke.mjs`, `tools/browser-smoke.mjs`.

Documentation: this file, `AGENTS.MD`, `WALKING-UPGRADE.md`. Removed: the obsolete geolocation plugin. Tree CSV, links, GIS geometry, photos, responsive assets and pure route helpers are unchanged by this migration.

## Run checks

```powershell
node --test tests/walk-core.test.cjs tests/map-view.test.cjs tests/location-tracker.test.cjs
node --check src/map-view.js
node --check src/location-tracker.js
node --check src/walk-experience.js
py -m http.server 8765 --bind 127.0.0.1
```

In another terminal, launch isolated Chromium with remote debugging on port 9222, then run `node tools/maplibre-smoke.mjs`. The harness uses Node's built-in WebSocket/CDP, with no browser-test dependency. QA profiles/screenshots stay in ignored `.qa/`.

The deployed app needs no package manager or build. Keep CDN dependencies and local relative asset paths available over HTTP/HTTPS. GitHub Pages remains supported.

## Outstanding field verification

Physical iOS Safari and Android Chrome were not available. Real sensor permissions, compass calibration, GPS drift under tree cover, mobile GPU/battery behavior, safe-area/keyboard behavior and sunlight readability need device testing. The supplied screenshot was absent, so final visual comparison against that exact image remains outstanding. Terrain awaits a real DEM. Network-dependent basemaps and uncached assets are not a full offline-map solution; routes remain estimates from the supplied paths, not turn-by-turn or accessibility guarantees.
