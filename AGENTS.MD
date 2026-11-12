# AGENTS.MD

Guidance for coding agents working on the UOW Tree Walk static web app.

## Architecture

This is a buildless single-page campus tour for a local HTTP server or GitHub Pages.
MapLibre GL JS 5.24.0 is the sole renderer. Do not reintroduce Leaflet or a second GPS
watch. The MapLibre migration was explicitly requested by the user; the earlier
Leaflet baseline is preserved on backup/leaflet-walking-20261111.

- index.html: app shell, draggable sheet, panel-aware camera helpers, GIS loading,
  canonical tree data, walking graph and shortest-path utilities, original detail card.
- src/map-view.js: CampusMap owns the native MapLibre map, cached GeoJSON sources,
  clustering, feature state, basemap/style restoration, GPS layers, buildings and 3D.
- src/map-theme.js: pure Midnight/Daylight style builders and global vector building layers.
- src/location-tracker.js: renderer-independent LocationTracker, one geolocation
  watch, one compass listener, permission handling and the existing GPS button.
- src/walk-experience.js: walking sessions, budgets, arrival, follow, rerouting,
  persistence, browsing and summary views.
- src/walk-core.js: pure route planning, stable IDs and saved-state validation.
- src/walk.css: adaptive app layout; src/tree-card.css: original UOW detail layout;
  src/midnight.css: UOW editorial theme, self-hosted Montserrat and final component styles.
- src/trees.csv, src/trees_links.json: tree content and extra links.
- campus_paths.geojson: OSM walking network. Local buildings.geojson is a historical
  asset only; never fetch it for the current map or duplicate global building geometry.
- photos/optimized/manifest.json: responsive WebP variants; originals load only on
  explicit poster enlargement. Photo-only 160/320 crops serve list cards; poster
  variants stay complete. Regenerate with py tools/optimize-images.py (Pillow).
- src/fonts: licensed Montserrat WOFF fonts, native MapLibre SDF glyph ranges and OFL.
  Font generation tools are development-only; see MIDNIGHT-EXPLORER.md.

## Map and coordinates

The global map is the native MapLibre instance or null when WebGL is unavailable.
The global mapView is always a CampusMap instance and retains application geometry
in either case. Check map availability, or use mapView camera/data methods.

GeoJSON and MapLibre use [longitude, latitude]. Existing graph node coordinates and
flyToVisible inputs use [latitude, longitude]. Convert at the renderer boundary;
never change routing coordinate order to match the renderer.

Use flyToVisible, fitHomeView and getMapPadding for camera changes. Padding responds
to the sidebar, sheet, safe areas and visual viewport. Keep maxZoom at 19.

Native GeoJSON sources use the uow- prefix. Numbered route stops use uow-trees
without clustering. Off-route exploration uses uow-explore, clustered through zoom
17 with +count labels, visible in Browse only. Selected trees remain visible on their
own. Active/current/visited/skipped appearance uses native feature state. Data must survive
style switches and context restoration. Wait for style.load before adding overlays.

Basemaps: UOW Midnight Explorer (default), Daylight Explorer (Outdoor), and NSW Spatial
Services public imagery. The vector themes restyle OpenFreeMap Dark/Positron using
src/map-theme.js. No CARTO or paid API dependency. Preserve camera, selection,
progress and the single GPS watch when switching. Keep native attribution accessible
as a compact bottom-right disclosure with a scalable information icon; never remove provider links.
Expanded attribution collapses after five idle seconds. Keyboard/touch interaction
renews the timer; move focus back to its disclosure if a focused link is hidden.

2D is north-up and overhead. 3D enables pitch/rotation and native fill extrusions.
Buildings use the global OpenMapTiles building vector layer already in OpenFreeMap.
Strip provider building layers before installing our one fill/extrusion pair. Read
render_height/render_min_height; omit hide_3d features in 3D. Heights are approximate,
with a 6 m display fallback and 100 m cap. Aerial adds this vector source only while
3D is enabled and removes it on return to 2D. Do not add a second scene engine.
Keep 3D buildings opaque and above all ground route/highlight geometry, below
stop/GPS overlays. CampusMap.orderBuildings restores that ordering on 3D toggles,
style changes and graphics recovery. Do not reintroduce routes through building faces.
Terrain is off: no DEM has been supplied. Any future terrain source must be a real,
licensed raster DEM. Do not create artificial elevation.

## State and interactions

- treeData/treeById are canonical; currentRoute is the selected tour order.
- Display stop numbers from currentRoute, never from transient CSV row IDs.
- Save progress with stable keys. Preserve uowTreeWalkSessionV1,
  uowTreeWalkCustomSettings and uowTreeWalkWalkingPreferences compatibility.
- Basemap and 3D preferences use uowTreeWalkMapSettingsV1.
- Missing legacy settings keys default to enabled as before.
- Walk views are home, walking, browse, detail and summary. Native GPU failure must
  leave tree browsing, walking state and persistence working.
- Preserve original detail structure: compact read-only current-walk badge and statistics,
  context-aware Back to walk / Trees opposite GPS status, common/scientific names, route-stop badge,
  complete uncropped poster, ABOUT Family/Features rows, link pills, green visit button.
- walkingDetailsOpen is transient UI state, not session data. Walking starts in a
  compact overview on desktop and mobile; View tree opens reading, Back to walk
  restores overview without changing progress. Sheet snaps synchronise reading state.
- Change routes only through the planning flow, not buttons inside tree details.
  Keep Location/Follow and Map tools top-right. The existing mode-3d button belongs
  inside Map tools alongside theme selection, never in the floating toolbar.
- Position settings/utility popovers next to their actual trigger using visual
  viewport bounds, safe areas and available height. ResizeObserver repositions only
  open menus; outside dismissal must not move the camera or change the view.
- Essential metadata/GPS text is at least .875rem. Weak-GPS text uses a dark amber
  outdoors (#805000), retains the icon and explicitly says Weak GPS.
- The GPS button stays owned by index.html. Permissions require a user action;
  never start GPS on page load or automatically mark a tree visited.
- Follow pauses on manual map gestures. Arrival requires fresh accurate stable
  readings. Routes and the direct bearing are distinct; do not claim turn-by-turn
  navigation or path accessibility guarantees.
- Campus paths remain a Settings option; do not add a floating paths control.
- Keep conventional map controls as icons; use short words plus icons for primary
  actions, filters, Skip and tree navigation. Preserve aria-label/title and 44px+
  touch targets at every width. Do not abbreviate
  botanical information or remove GPS/bearing explanations from accessible names.
- Outside taps dismiss popovers without changing the current view, selected tree,
  sheet state, camera or walking session. Empty-map clicks never call backToList/showHome.

## Verification

Run node --test tests/*.test.cjs and syntax-check modified scripts. The browser suite
is node tools/maplibre-smoke.mjs (tools/browser-smoke.mjs is a compatible alias), with
an HTTP server on 8765 and isolated Chromium CDP on 9222. See MAPLIBRE-MIGRATION.md.
Test native layer clicks/clusters, all route modes, all three styles, 2D/3D, camera
padding, GPS denial/retry/accuracy, compass fallback, arrival, skip/rerouting,
settings, saved progress, poster enlargement and missing images. Exercise real WebGL
context loss/restoration and a no-WebGL browser fallback. Check fluid viewports,
landscape, text enlargement, sheet gestures and visible attribution.
Run node tools/midnight-qa.mjs for five-view fluid layouts, controls/settings visibility,
live global 3D, lazy aerial buildings, local media and browser-console/HTTP checks.
Run node tools/occlusion-qa.mjs for native screenshot pixel checks of route occlusion
and visibility outside a building. Pillow is required only for this QA tool.
Run node tools/popover-qa.mjs for real touch dismissal without navigation and
five-second attribution timing, interaction renewal and keyboard focus restoration.
Run node tools/ui-audit-qa.mjs for mobile/desktop reading returns, inert mode badges,
anchored menus at enlarged text, Outdoor warning contrast and collision priorities.

Avoid reverting unrelated changes. No package installation, build step or framework
is required. Physical iOS/Android sensor and battery tests remain a separate field QA
step; distinguish them from desktop emulation in reports.
