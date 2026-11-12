# UOW Midnight Explorer

Implemented incrementally in the existing `treewalk5` checkout. This pass builds on
the native MapLibre migration; it does not introduce a second renderer, framework,
build requirement or API key. The supplied Helsinki screenshot informed the quiet
blue buildings, muted vegetation, fine dotted route and editorial stop listing.
UOW red and Montserrat adapt that atmosphere to this campus guide.

The subsequent [UI audit implementation](UI-AUDIT-IMPLEMENTATION.md) supersedes
earlier notes about detail route-switching buttons, the floating 3D toggle and
fixed-position popovers. It preserves the original reading-card structure.

## Popover and button follow-up

Attribution was subsequently moved to the bottom-right at the user's request.
Its information button uses an inline SVG that inherits the active theme colour;
the native disclosure, provider links and five-second timeout are retained.

- Expanded attribution automatically collapses after five seconds of inactivity.
  Touch/keyboard interaction renews the timer. If a link has focus, collapse returns
  focus to the attribution button. Provider links remain available on reopening.
- As clarified by the user, outside taps close popovers and preserve the current
  view, selected tree, sheet, map camera and active walk. Empty map taps no longer
  trigger list/home navigation. Tree markers and buttons retain their own actions.
- Button audit restores useful words beside icons: Start/Resume walk, View tree,
  Skip, Browse trees, Visited/Unvisited filters, tree Map/Previous/Next and Fit walk.
  Familiar location, settings, zoom and attribution controls remain compact icons.
  The perspective toggle includes a 2D/3D caption. Filters use balanced two/four
  columns and reflow to one column with enlarged text in a narrow container.
- Files: `index.html`, `src/map-view.js`, `src/walk-experience.js`, `src/midnight.css`,
  `tools/popover-qa.mjs`, existing layout QA and agent guidance.
- Verification: 13 Node tests; walking/GPS/session smoke checks and 59 layout cases;
  45 five-view layouts, enlarged home/browse text, accessible names and real icon
  glyphs. Dedicated mobile/desktop touch and timing checks cover dismissal without
  navigation, five-second collapse, keyboard renewal and focus restoration.
- Physical iOS/Android testing remains outstanding. Browser background timer
  throttling may delay automatic collapse until the page becomes active.

## 12 November refinement — building depth and symbols

- Opaque 3D buildings now render above ground route geometry, including its halo,
  direct connections and repeat highlights. Stop numbers and GPS overlays remain
  above the scene. Ordering is restored on toggles, style switches and graphics recovery.
  This uses native MapLibre layer ordering and [opaque fill extrusions](https://maplibre.org/maplibre-style-spec/layers/#fill-extrusion-opacity).
- Secondary navigation, map fit/zoom, follow, attribution and tree previous/next/map
  actions use symbols at all widths. Primary actions retain short words (Start,
  Resume, View, Mark visited) and icons. Route/stop/time/status metrics use symbols;
  botanical content and the original poster/card structure remain intact.
- Icon controls retain descriptive accessible names, tooltips, keyboard support and
  minimum touch targets. Quantities and GPS/bearing explanations remain accessible.
- Files: `index.html`, `src/map-theme.js`, `src/map-view.js`, `src/walk-experience.js`,
  `src/midnight.css`, related QA tests and this guidance.
- Checks: 13 Node tests; 59 native regression layouts plus 45 five-view layouts and
  enlarged text; GPS/session regression; visible icon glyphs and accessible names.
  A new `node tools/occlusion-qa.mjs` synthetic native-WebGL test verifies the route
  is hidden under a building, stays visible outside it, and reappears when the
  building is hidden, without modifying route geometry. Covered pixel was RGB
  `35,60,90`; visible route was `237,10,0`. QA-only screenshot reading uses Pillow.
- Physical iOS/Android testing remains outstanding. Dense route stops still need
  zooming/list navigation; global building heights remain approximate.

## Phase 1 — Map foundation and visual style

**Changed:** `src/map-theme.js`, `src/map-view.js`, `index.html`, `src/fonts/`.

- Named Midnight Explorer and Daylight Explorer vector themes, plus NSW public aerial
  imagery. Themes preserve native camera, selected tree, route, GPS and saved progress.
- Official supplied UOW palette: navy `#001641`, red `#ED0A00`, blue `#0033FF`, white.
  Quiet blue roads/buildings, muted green parks and blue-green water; most POIs and
  minor labels are removed. Major road labels appear only at close zoom.
- Fine red dotted route with restrained white highlights; direct connectors retain
  a different blue-grey dash pattern. No continuous glow animation or render loop.
- Self-hosted Montserrat for UI and native map labels. The application makes no
  external font-service request. Local glyph URLs work beneath a GitHub Pages subpath.

**Verification:** pure theme tests cover provider-style immutability, palette,
label filtering, duplicate-building removal and local glyph configuration. Native
browser checks cover all live basemaps and state/camera retention.

**Limits / next:** public tiles require a connection and have no availability guarantee.
Compare sunlight readability on actual campus devices before final palette tuning.

## Phase 2 — Walking overlays and continuity

**Changed:** `src/map-view.js`, `src/walk-experience.js`, `index.html`.

- Route stop numbers come from the current route order; stable tree identities remain
  the persistence keys. Route stops never become cluster counts. Off-route trees
  cluster only during browsing, with distinct `+count` labels.
- Default, current/selected, visited and skipped states use native feature state.
  Larger invisible touch hit areas help select the small map markers.
- GPS-off, weak-accuracy and compass-fallback messages are concise. The direction
  arrow still indicates a direct bearing, explicitly separate from mapped paths.
- Preserved four walk modes and time budgets, nearest/recommended ordering, campus
  graph and shortest-path cache, GPS watch, Follow Me, arrival, skips, rerouting,
  pause/resume, saved progress and summaries. No permission request on page load.
- Existing localStorage keys and settings defaults remain compatible. Reload restores
  progress with GPS off; arrival never marks a tree visited automatically.

**Verification:** Node route/arrival/session/sensor tests plus native browser tests
for modes, skip/visit, GPS denial/retry/poor accuracy, heading rejection/fallback,
arrival, manual-pan follow cancellation, rerouting, summary and reload restoration.

**Limits / next:** approximate path data does not describe closures, access conditions
or turn-by-turn instructions. Closely adjacent stops can overlap in a wide overview;
zoom or use the stop list. Field-test GPS under tree cover and calibrate thresholds.

## Phase 3 — Editorial UI and original detail card

**Changed:** `index.html`, `src/midnight.css`, `src/walk-experience.js`,
`photos/optimized/manifest.json`, 98 photo WebPs, `tools/optimize-images.py`.

- Cleaner home title, route estimate, primary start/continue action and three-stop
  preview. Search/filters remain in Browse; walking keeps the compact next-stop strip.
  The same Settings button moves between home and header; no duplicate control.
- Fluid sidebar, measured three-state sheet and content-based landscape reflow.
  Half is normally near 45% of the visual viewport, grows to fit home actions up to
  62%, and remains below Expanded. Expanded reserves space for the map controls and
  attribution. Browser text sizing, keyboard resizing, safe areas and reduced motion
  remain supported. ResizeObserver updates measured layout without a render loop.
- Original detail design retained: compact dark header, route controls and statistics,
  Back to Tour List/GPS row, bold common name, italic scientific name, stop badge,
  large uncropped rounded poster, ABOUT Family/Features, pill links and full-width
  green Mark as Visited. Enlargement, Find on map and previous/next remain available.
- Tour-order controls now say Full tour / Nearby instead of REC / NEAR, with their
  existing route calculations and button IDs retained. Narrow headers reflow the pills.
- List thumbnails now use authentic photo-only crops from the supplied poster artwork.
  Full posters and source images are unchanged. Responsive 160/320 photo variants
  are lazy-loaded; detail uses complete 320/640/1280 posters. WebP is retained rather
  than adding redundant AVIF assets. All six variants total approximately 11.25 MB;
  each browser loads only the needed variants.

**Verification:** original card structure, image aspect ratio, route badges, image
enlargement/Escape, browsing/search and missing-image fallback. Responsive checks
include phone, tablet, desktop, landscape, intermediate widths and 200% text.

**Limits / next:** tiny text inside original posters requires enlargement; searchable
HTML botanical content remains available below. Photo crops share the poster template;
dedicated botanical photography would allow individually curated crops.

## Phase 4 — Lightweight global 3D and attribution

**Changed:** `src/map-theme.js`, `src/map-view.js`, `index.html`, `src/midnight.css`.

- Removed runtime `buildings.geojson` loading, derived local-height workflow and its
  obsolete functions. Historical GIS files remain in the repository as original data.
- One internal native MapLibre building layer uses OpenFreeMap's global OpenMapTiles
  `building` source layer. Flat footprints use the existing vector source in 2D.
  Optional 3D uses `render_height` and `render_min_height`, excludes `hide_3d` outlines
  and replaces the flat layer. There is no duplicate provider/local extrusion.
- Heights are approximate provider values, which may already be inferred from
  storeys or defaults. Display fallback is 6 m; heights are capped at 100 m. This is
  visual exploration, not an architectural model. Terrain remains off.
- 2D is the clean north-up default. 3D enables a subtle 48° perspective and rotation.
  Aerial loads the additional global vector source only while 3D is enabled, then
  removes it on return to 2D. Trees, route, selected stop and GPS remain native layers.
- Native attribution is a compact keyboard-operable Map data disclosure at bottom
  left, above the sheet/outside the sidebar. Full provider links remain accessible
  and update automatically for each source. A one-time observer initialises the
  collapsed state after provider metadata arrives; user toggles remain native.

**Verification:** live global building features, one extrusion layer, all basemaps,
camera/state retention, 2D keyboard behavior, lazy aerial-source creation/removal,
attribution disclosure and no local-building HTTP request.

**Limits / next:** global coverage and height completeness depend on OSM-derived
provider data. Review important campus buildings against a verified source if greater
detail is later required; do not silently reintroduce duplicate geometry.

## Phase 5 — QA, cleanup and performance

**Changed:** `tests/map-view.test.cjs`, `tools/maplibre-smoke.mjs`,
`tools/midnight-qa.mjs`, font-generation tools, `AGENTS.MD` and implementation notes.

- Retained cached graph/route calculations, source change detection, one GPS watch,
  coalesced heading rendering, capped workers/pixel ratio and native GPU layers.
- No MapToolkit dependency, model downloads, animation loop, extra scene or image service.
- An idle-page probe recorded no layout updates, map resizes or route calculations
  during a settled 1.5-second sample. This is not a hardware battery benchmark.
- Self-hosted font assets and photo crops use normal browser caching. This remains
  a static GitHub Pages app. No service worker/offline tile prefetch was added.
- Removed obsolete local-building code and updated the previous height tests to
  validate the global schema. Historical migration notes are explicitly marked.

Run locally:

```powershell
node --test tests/*.test.cjs
py -m http.server 8765 --bind 127.0.0.1
# With isolated Chromium CDP on port 9222, in another terminal:
node tools/maplibre-smoke.mjs
node tools/midnight-qa.mjs
```

The browser suites use Node's built-in WebSocket/CDP and real native WebGL. Live
map checks run separately from tile-free viewport sweeps to limit automated traffic
to public services. Screenshots/profiles are stored under ignored `.qa/`.

Verification completed:

- 13 Node tests passed.
- Native walking regression suite passed, including three live basemaps, context
  loss/restoration and no-WebGL fallback; no uncaught JavaScript exceptions.
- 59 fluid detail layouts, including a continuous 17-pixel width sweep, plus 200% text
  and touch sheet dragging passed.
- 45 additional layouts across home, browse, walking, detail and summary passed,
  including 320/375/390/430 widths, tablet/desktop and landscape. Four further 200%
  text layouts passed. Map controls and Settings stayed in the visual viewport.
- All 49 originals and 294 responsive image assets were present. Normal-use live-map
  QA recorded no JavaScript, console or HTTP errors and no local building requests.
- Script syntax, native Montserrat rendering, original poster layout and whitespace
  checks passed. Desktop/phone Midnight, Outdoor, 3D, browser and detail screenshots
  were inspected during implementation.

Physical iOS Safari and Android Chrome are unavailable in this environment. Real sensor calibration, mobile
GPU/battery behavior, VoiceOver/TalkBack, safe-area/virtual keyboard behavior and
direct-sunlight usability remain device/field QA, not claims from desktop emulation.

## Fonts, data and reproducibility

Montserrat follows [UOW's published font guidance](https://www.uow.edu.au/brand/resources/).
The bundled font licence is `src/fonts/OFL.txt`. Latin/extended Latin and common
punctuation cover the supplied campus content. Native map glyphs use the three local
PBF ranges `0–255`, `256–511`, `8192–8447`; extending the language set requires new
font subsets/glyph ranges.

To regenerate fonts, obtain the normal and italic Montserrat variable TTFs plus OFL
from the [Google Fonts Montserrat source](https://github.com/google/fonts/tree/main/ofl/montserrat),
place the TTFs as `.qa/font-source/Montserrat.ttf` and `Montserrat-Italic.ttf`, and run
`py tools/build-font-assets.py` (fontTools). Then run `node tools/build-map-glyphs.mjs`
with the local server and CDP browser available. The development tool uses pinned
TinySDF 2.0.7 only during generation; it is not a deployed dependency. Recheck native
number centring if changing glyph metrics. Commit generated fonts/glyphs and licence.

Basemap/3D source: [OpenFreeMap](https://openfreemap.org/), with the
[OpenMapTiles building schema](https://github.com/openmaptiles/openmaptiles/blob/master/layers/building/building.yaml)
and OpenStreetMap attribution. Aerial:
[NSW Spatial Services imagery](https://data.nsw.gov.au/data/dataset/nsw-imagery).
These source links remain in the map's native attribution. Campus paths, tree CSV,
botanical links and original photos are reused from the existing application.
