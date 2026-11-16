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
- src/map-label-layout.js: pure screen-space marker spacing, route/rectangle
  intersections, label placement and optional connectors. No routing calculations.
- src/map-theme.js: pure Midnight/Daylight style builders and global vector building layers.
- src/location-tracker.js: renderer-independent LocationTracker, one geolocation
  watch, one compass listener, permission handling and the existing GPS button.
- src/walk-experience.js: walking sessions, budgets, arrival, follow, rerouting,
  persistence, browsing and summary views.
- src/walk-core.js: pure route planning, stable IDs and saved-state validation.
- src/walk.css: adaptive app layout; src/tree-card.css: original UOW detail layout;
  src/midnight.css: Midnight component baseline and self-hosted Montserrat.
- src/editorial.css: editorial layout, live walk summary, unified inspector and
  content-driven responsive overrides. src/glass.css is the final presentation
  layer: translucent white fills over Midnight navy, restrained outer backdrop
  filters and light rows without nested blur. Bright basemaps optically dim only
  behind floating surfaces for legibility. Reduced transparency/unsupported filters
  have a readable solid fallback. Map themes stay independent of UI surfaces.
  Plant reading alone uses matte rgba(25,39,52,.78), one outer 12px blur,
  minimal translucent botanical sections and sage-green tab accents. Its
  reduced-transparency fallback is solid #192734; other views keep their styling.
  The Trees browser uses a restrained translucent navy surface, red selection
  borders and one shared Walk/Trees navigation node with the planning view.
- src/campus-scene.js and campus-scene-worker.js: clip loaded global building
  polygons against UOW_boundary.geojson; retain provider names and height fields.
  Polygon intersection uses the small pinned MIT helper in src/vendor.
- src/trees.csv, src/trees_links.json: tree content and extra links.
- campus_paths.geojson: OSM walking network. Local buildings.geojson is a historical
  asset only; never fetch it for the current map or duplicate global building geometry.
  The native campus path stroke and soft halo share visibility/restoration. Tagged
  sidewalks/crossings are quieter than ordinary footways; all remain below the
  red tour route and 3D buildings. Do not change network geometry for styling.
- photos/optimized/manifest.json: responsive WebP variants; originals load only on
  explicit poster enlargement. Photo-only 160/320 crops serve list cards, with a
  640px photo for the detail gallery; poster
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
Camera padding is persistent in MapLibre. Reserve the visible inspector/sheet,
then avoid floating controls and the walk menu. Layout changes shift the apparent
centre without replacing the geographic view or interrupting a camera animation.
Fit Walk must not pass the same padding twice: native transform padding already
reduces cameraForBounds' usable area. Do not add Mapbox-only retainPadding flags.
Navigation limits use CampusScene.expandedBounds on the loaded campus boundary:
twice its longitude and latitude spans, centred on the boundary's bounding box.
These geographic limits remain the same on every viewport; calcBounds is only a
fallback while the boundary is unavailable. Do not reapply limits on every resize.

Native GeoJSON sources use the uow- prefix. Numbered route stops use uow-trees
without clustering. Off-route exploration uses uow-explore, clustered through zoom
17 with +count labels, visible in Browse only. Selected trees remain visible on their
own. Active/current/visited/skipped appearance uses native feature state. Data must survive
style switches and context restoration. Wait for style.load before adding overlays.
The focused tree uses one DOM label beside its native marker: a name and compact
inline stop/distance/visit statistics. Local Lucide masks are 13px beside 12px
medium text at default scale, with 8px spacing and thin separators. Labels compact
according to the sheet/available map width; full accessible descriptions distinguish
walking-path and direct distances and identify the origin/GPS state. The renderer's
getTreeStats callback uses the walking module's cached leg, never recalculating a
route just for camera/layout changes. Live location and visit/skip changes refresh it.
CampusMap updates placement
only after camera/layout/selection changes, flipping around edges and avoiding UI
obstacles. Hide it when no clear placement remains; do not add another map or GPS
watch, duplicate the native priority name, or recenter merely to place the label.
Numbered stops and unclustered exploration dots use view-dependent display filters
to avoid crowded circles, prioritising selection/current and unvisited stops.
Keep all canonical coordinates and source IDs intact. Label-only GeoJSON may move
to clear screen positions; labels avoid markers, other labels, visible UI and path
strokes, adding short connectors only when displaced. Annotation layout is capped
at 10Hz during camera changes and stays idle otherwise; style changes restore it.
Markers use thin cyan outlines and restrained glow, keeping existing state colours.
Close route stops which cannot fit as circles receive bounded numbered callouts
from the label-only uow-stop-labels source. Connector lines lead to the unchanged
uow-trees coordinate; small exact-position dots show when not covered by a retained
circle. Never move canonical trees or reroute paths for display spacing. Callouts
reuse marker paint/feature state and stable tree IDs, stay above buildings, and use
the existing native click handler. Preserve them through style/context restoration.
Annotation filter/data mutations wait for map.loaded() and drain once on idle.
Do not reparse annotation layers while initial GeoJSON/glyph tiles are loading:
the pinned renderer can otherwise draw geometry with stale feature-query indexes.
Native query tests must cover expected display IDs, not merely returned subsets.
Our display filter owns circle/number collision priority. Keep native stop numbers
centred with overlap enabled so its second collision pass cannot leave blank circles;
tree-name layers retain native collision handling in addition to screen-space layout.

Basemaps: UOW Midnight Explorer (default), Daylight Explorer (Outdoor), and NSW Spatial
Services public imagery. The vector themes restyle OpenFreeMap Dark/Positron using
src/map-theme.js. No CARTO or paid API dependency. Preserve camera, selection,
progress and the single GPS watch when switching. Attribution is a section inside
Map layers, not a separate map popup. The native control still updates its live
provider content, but its disclosure wrapper is detached and its inner content is
hosted in map-attribution-content. Retain all provider links, including imagery.
Keep the static path credit as a no-WebGL fallback. Do not restore a floating icon
or the old five-second collapse timer.

2D is north-up and overhead. 3D enables pitch/rotation and native fill extrusions.
Buildings use the global OpenMapTiles building vector layer already in OpenFreeMap.
Strip provider building layers before installing our one fill/extrusion pair. Read
render_height/render_min_height; omit hide_3d features in 3D. Heights are approximate,
with a 6 m display fallback and 100 m cap. Aerial adds this vector source only while
3D is enabled and removes it on return to 2D. Do not add a second scene engine.
Keep 3D buildings at 95% opacity and above all ground route/highlight geometry, below
stop/GPS overlays. CampusMap.orderBuildings restores that ordering on 3D toggles,
style changes and graphics recovery. Do not reintroduce routes through building faces.
Terrain is off: no DEM has been supplied. Any future terrain source must be a real,
licensed raster DEM. Do not create artificial elevation.
The supplied campus outline is indicative, not surveyed. Preserve its provenance.
Render clipped GeoJSON buildings, not the unfiltered global layer. Reclip when
loaded vector tiles change; retain the result through basemap/style restoration.
Do not render campus masks, stepped tint/feather bands, perimeter lines or a boundary
legend item. The mask computation was removed. Retain outline geometry only for
building clipping and navigation limits; no full-canvas blur/postprocessing.
Building labels at zoom 18+ use genuine provider names/education POIs only.

## State and interactions

- treeData/treeById are canonical; currentRoute is the selected tour order.
- Display stop numbers from currentRoute, never from transient CSV row IDs.
- Save progress with stable keys. Preserve uowTreeWalkSessionV1,
  uowTreeWalkCustomSettings and uowTreeWalkWalkingPreferences compatibility.
- Basemap, 3D, Buildings and Walk route visibility use uowTreeWalkMapSettingsV1.
  New buildings/route keys default to true. Auto-centre selection defaults to true
  in existing walking preferences. Explicit Find on map/Fit walk bypass that preference.
- The Buildings On/Off preference applies only to 2D. Hide/disable that row in 3D;
  extrusions remain visible regardless of the saved 2D choice. Restore that choice
  on return to 2D. Do not overwrite it when entering 3D.
- Missing legacy settings keys default to enabled as before.
- Walk views are home, walking, browse, detail and summary. Native GPU failure must
  leave tree browsing, walking state and persistence working.
- Preserve the detail structure with compact context-aware Back to walk / Trees
  opposite GPS status, common/scientific names and route-stop badge
  over a restrained faded image overlay. The gallery offers the supplied photograph
  and complete uncropped poster with enlargement; never invent extra image counts.
  Keep the small image counter; no white gallery arrow controls. Horizontal
  pagination dots accompany it when multiple images exist: 5px circles, 6px gaps,
  14px active pill and 225ms width/opacity transitions. One transparent 44px
  touch/keyboard slider hosts the tiny indicators, avoiding overlapping small
  button targets. Keep its node/focus when swapping images and synchronise it
  after swipe/keyboard/direct selection. Reserve a slim visual footer lane below
  names/species/Stop; hide the entire pagination for a single image.
  Horizontal touch swipe, mouse drag and Left/Right/Home/End browse images. Enter/Space still
  enlarge. Vertical scrolling and pinch zoom must remain native; never turn a drag
  into an enlargement click, and retain keyboard focus after swapping an image.
  Overview contains Family and identifying features; Plant resources contains all
  existing links as compact rows. Tabs use keyboard arrows/Home/End and native
  ARIA tab semantics. The reading header and Map/green visit/Previous/Next action
  row stay pinned while content scrolls. Previous/Next share a subtle surface in the right third of
  the action row, expanding only as needed for minimum touch targets. Give the visit tick
  comfortable spacing from its label.
  Reading omits the repeated UOW title, walk-mode badge and header statistics.
  Keep the active walk menu in detail-nav, restoring it to guidance on return.
  Keep desktop panel dimensions and every other view's styling intact.
- walkingDetailsOpen is transient UI state, not session data. Walking starts in a
  compact overview on desktop and mobile; View tree opens reading, Back to walk
  restores overview without changing progress. Sheet snaps synchronise reading state.
  Mobile sheets are capped at 50% of the visual viewport, with a roughly 45% half
  state. Keep details scrollable inside that limit, including enlarged text and
  landscape. The portrait Map Tools bottom panel uses the same maximum fraction.
  Short landscape reading uses named icon controls. Brand/progress remain
  available in Map Tools while reading.
  Default-text layout ranges: below 768px uses a sheet with 16px padding; tablet
  uses clamp(320px,38vw,380px) and 20px padding; desktop from 1024px uses
  clamp(420px,30vw,460px). CSS rem limits and the JS sheet threshold respond to
  text enlargement. Home sidebars fit content up to the viewport; lists/readers
  scroll independently. Preserve panel-aware padding without refitting on resize.
- Change routes only through the planning flow, not buttons inside tree details.
  Keep Location/Follow and Map tools top-right. The existing mode-3d button belongs
  inside Map tools alongside theme selection, never in the floating toolbar.
- Change walk reuses native route-options, walk-mode and walk-start controls.
  Its X is a sibling of details, never a button nested inside summary. X exits
  the selected tour: stop navigation/timer/GPS, clear target, skipped stops and
  route/repeat/endpoint geometry, preserve visited history, show all trees and
  fit their extent through fitHomeView. It is not a simple disclosure dismissal.
  Keep the compact Lucide route/map-pin/chevron/X masks local and licensed.
  Route choices show network estimates including unvisited stop time. Cache
  plans by origin/visited/network signature; recompute only on opening/focusing
  the planner, changing its start or the first requested GPS fix, not camera ticks.
  Selecting a mode keeps the planner open so Start from remains accessible.
  The additive V1 session status exploring persists an intentionally empty route
  and null target. Restore it without generating the default Quick Walk. Merely
  changing a starting tree in this state must not select a route.
  CampusMap.allTreesVisible derives from that status: use all canonical uow-trees
  points without clusters or density suppression, with zero tour-stop numbers.
  Empty uow-explore to avoid duplicate points. Preserve this through style/context
  recovery; selecting a walk restores the ordinary clustering/collision rules.
  Never renumber trees or move their coordinates to implement this overview.
- Map Tools is one viewport-bounded progressive inspector: live progress and ring,
  full-width primary action, New walk/Done beneath, and quick basemap/2D/3D segments.
  Arrival, auto-centre, Buildings, Walk route and extra preferences share one native
  Advanced settings disclosure, initially collapsed. Reuse existing settings IDs
  and nodes; do not create another settings popup. Map Guide is removed;
  Fit walk belongs in the inspector heading beside its close button and keeps
  the inspector open, fitting into the remaining map area.
  The sole entry point is map-tools-toggle. Do not reintroduce custom-toggle or a
  Settings link in the walk menu. Move walk-menu-toggle into the reading header
  while details are open (the compact reading navigation row on short screens),
  restoring it to compact guidance on return.
  The walk menu remains anchored to its trigger. ResizeObserver repositions only
  open menus; outside dismissal must not move the camera or change the view.
- Map layers use native radio segments, not selects. Keep each selector on one
  line, with keyboard-arrow support and visible focus. The basemap has Dark,
  Light and Aerial options; at constrained enlarged text it uses named icon tabs.
  Arrival distance and its number/unit control remain on the same horizontal row,
  with a shorter visual label only when needed; retain the full accessible name.
- Essential tree metadata/GPS text is at least .875rem. Compact summary captions
  use .75rem and short one-line wording. Weak GPS uses pale amber on the
  navy guidance header in all themes, retains its warning icon and explicit text.
- Distance icons use the local Lucide Footprints SVG in src/icons, with its
  upstream license. actionHTML('footprints') and the static distance/arrival
  icons share a currentColor CSS mask. Route/planning icons and bearing arrows
  remain distinct. Keep path/direct/GPS descriptions in accessible names.
- The summary uses real route progress, walked-distance estimates and elapsed
  time including stops. Opening Map Tools must not pause/reset a walk. Its primary
  action reflects Start/Resume/Pause/Explore. The main summary keeps its single
  action row and 2x3 statistics. Map Tools uses a full-width primary with secondary
  New walk/Done below, and reuses the header's existing remaining-distance/time
  estimates without recalculating a route for display. Saved status
  is an identifiable phone beside the heading: green with a check when saved,
  gray with a failure indicator if storage fails; retain an accessible status name.
  Statistics form two aligned rows (values/labels) across three columns. At highly
  enlarged text they may stack to preserve readability; do not wrap 2+1 on phones.
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
in-pane attribution keyboard access/focus restoration.
Run node tools/ui-audit-qa.mjs for mobile/desktop reading returns, inert mode badges,
anchored menus at enlarged text, Outdoor warning contrast and collision priorities.
Run node tools/editorial-qa.mjs for mockup summary/layout, live data, layer/selection
preferences, persistence, 200% text and reduced motion. Use py tools/preview.py to
serve fresh app assets while public tiles retain their normal browser cache.
Run node tools/viewport-qa.mjs for the actual unobstructed canvas centre, geographic
view preservation, selected-tree focus, landscape inspector, 2x3 statistics,
mandatory 3D buildings and restoration of the saved 2D visibility choice.
Run node tools/refinement-qa.mjs for canvas edge coverage, container-only resize,
high-density screens, one-line actions/captions, live provider credits, removal of
mask layers and updated reading-card structure. Observe the map container itself;
resize native rendering from its measured dimensions with a small CSS overscan.
Run node tools/plant-detail-qa.mjs for native focus-pill edge placement, resources
and keyboard tabs, real photo/poster gallery, pinned reading controls, enlarged
text, theme restoration and idle label updates.
Run node tools/progressive-tools-qa.mjs for the progressive inspector, live ring
and estimates, disclosure keyboard access, original handlers, focus retention,
settings persistence and collapsed/expanded responsive layouts.
Run node tools/adaptive-map-qa.mjs for sidebar ranges, 767/768 and 1023/1024
transitions, marker/label collision spacing, unchanged geometry, swipe/drag/keyboard
carousel controls, vertical touch scrolling, style restoration and idle layout.
Run node tools/glass-qa.mjs for live single-line desktop estimates, wrapped mobile
metrics, frosted surfaces without nested filters, bright-backdrop screenshot
contrast, enlarged text and reduced-transparency fallback.
Run node tools/crowded-stops-qa.mjs for Full Walk stops 2/3, zoom 15–19 across
phone/tablet/desktop, unchanged source/route geometry, native callout selection,
stable stop numbers, visited state, all styles/3D and actual graphics recovery.
Run node tools/marker-stats-qa.mjs for focused-label typography/icons, live
stop/distance/visit data, cached routing, compact/descriptive labels, bounds,
theme restoration, enlarged text and unchanged session state. A label may hide
on a short landscape map when no clear placement remains.
Run node tools/change-walk-qa.mjs for estimates/cache, manual starts, sibling close
controls, empty-route persistence, all native marker IDs/extent, style restoration,
unrouted Previous/Next, thirteen fluid/text layouts and real GPS/keyboard exit.

The Trees browser selects without opening the reader. List/native marker selection
updates the same activeTreeId and feature state without replacing a walk or target.
Its focused DOM label adds a lazy optimized photo and details chevron in Browse
only; the existing label/stat layout remains in other views. Narrow previews use
distance and a visit icon, retaining full stop/status/distance accessible names.
Missing preview images show a tree glyph; never fetch a full original for this
preview. The separate card-details button and preview both open the existing matte
reader, including without WebGL. Keep valid sibling selection/details buttons,
never nest buttons. Empty-map dismissal still preserves selection/view/camera.

A–Z, nearest and tour-order sorting affect the browser only. Stop numbers always
come from currentRoute, never the sorted row index. Nearby remains unvisited/nearest
and disables the separate sort selector while that filter is active. Counts use
actual filtered data. Compute each displayed walking leg once per render.
Desktop/tablet results scroll independently of controls when a complete row fits;
short landscapes fall back to one panel scroller, using measured chrome/row heights.
A mobile sheet uses one natural internal scroller so enlarged controls cannot
trap the list. Respect horizontal safe areas and keep its 50%
height limit. At comfortable text widths, mobile sorting sits inside search and
the count appears beside Trees; at enlarged text the same select moves back to the
count row. Preserve its node and keyboard focus when reparenting.

The native map compass resets camera bearing to north using easeTo, without moving
the geographic centre or starting sensors. Location/Follow remains a separate
existing GPS control. Controls form a right-hand vertical group, adapting to the
existing compact layout on short maps. The red tour uses restrained thin dashes;
keep native route source geometry, white highlights and 3D occlusion ordering.

Run node tools/browser-design-qa.mjs for Walk/Trees navigation, independent list
scrolling, search/counts/sorts, stable tour numbering/session, synchronized native
selection, optimized/failing previews, direct reader access, responsive sort focus,
touch input sizes, fourteen layouts including 200% text, notched safe areas,
reachable results on short screens, themes and compass reset.

Avoid reverting unrelated changes. No package installation, build step or framework
is required. Physical iOS/Android sensor and battery tests remain a separate field QA
step; distinguish them from desktop emulation in reports.
