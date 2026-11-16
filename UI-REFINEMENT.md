# UOW Tree Walk interface refinement

Implemented against the supplied Your walk and Map Tools mockups, 12 November 2026.
The editorial layout now uses the latest restrained glass reference; the default
map remains Midnight Explorer. Earlier light-surface work is retained as the layout
baseline beneath the final glass presentation layer.

## Carousel and distance icons — 13 November 2026

- Added 5px white pagination dots with 6px gaps, a 14px active pill and 225ms
  width/opacity transitions. Inactive dots render at 40% opacity. A small footer
  lane keeps the visual indicators clear of the common/scientific names and Stop
  badge. The real photo counter, poster, image enlargement and overlays remain.
- One transparent 44px slider supplies the touch/keyboard target without packing
  overlapping buttons around tiny dots. Click selects an image directly;
  Left/Right/Home/End, mouse dragging and native mobile swipe keep the dots and
  counter synchronized. The control keeps keyboard focus and hides completely
  for a one-image gallery. Reduced motion disables the transitions.
- Distance displays now share the local Lucide Footprints SVG: planning estimates,
  header, next stop, browsing cards, detail GPS distance, summaries and arrival
  distance. Route/planning actions and the direction arrow keep their distinct
  icons. Path/direct/GPS descriptions remain in accessible labels. The upstream
  SVG and license are stored in `src/icons`; no runtime icon library is loaded.

Files: `index.html`, `src/walk-experience.js`, `src/editorial.css`,
`src/glass.css`, `src/icons/`, expanded `tools/plant-detail-qa.mjs` and these notes.
Native dot clicks/swipes, keyboard focus, one-image hiding, reduced motion,
no-overlap placement at 100/200% text and all distance-icon contexts are checked.

## Full Walk close-stop visibility — 13 November 2026

- Stops 2 (Bolwarra, stable tree ID 6) and 3 (Coachwood, ID 14) are 2.69m apart in
  the supplied CSV. Their coordinates and route order were correct. Full Walk
  has no clustered off-route trees, and marker layers already sit above the route.
  The screen collision filter permanently hid stop 3, even at maximum zoom 19.
- The general collision layout now gives crowded route stops a displaced numbered
  label, joined to their true position by a quiet connector. Ordinary circles stay
  at their original points. Label-only geometry uses `uow-stop-labels`; canonical
  tree coordinates, walking-network geometry and persisted progress never move.
  Placement respects routes, controls, other markers and the focused pill, with
  a density cap. This fixes other close pairs without ID-specific conditions/CSS.
- Callouts reuse native marker appearance, selection/visited/skipped state and
  click handling. Selecting one opens the correct tree and focuses its real
  coordinate. Styles and WebGL restoration recreate the sources/layers normally.
- A second issue appeared under repeated startup/layout tests: applying density
  filters while MapLibre 5.24 was still parsing GeoJSON/glyphs could leave painted
  markers without matching query entries. Annotation mutations now wait for
  loading to settle and coalesce through the existing idle event. Native query
  checks cover every expected marker, repeated startup and both number/anchor
  clicks, rather than accepting only the subset returned by a query. The renderer
  version is unchanged. Upstream background: [MapLibre #7752](https://github.com/maplibre/maplibre-gl-js/issues/7752).

Files: `src/map-label-layout.js`, `src/map-view.js`, geometry unit tests,
`tools/crowded-stops-qa.mjs`, `AGENTS.MD` and these notes. Focused regression checks
cover both stops at zoom 15–19 across 320/390/800/1440px, all styles in 2D/3D,
native selection, visited state and actual graphics recovery. Captures:
`.qa/stops-*.png`. Very crowded overview labels remain density-limited; selecting
a tree from the list always gives its true-position marker priority.
Final validation: 29 unit tests and all 13 browser QA scripts passed, including
repeated startup, every displayed marker's native query entry, 2/3 selection,
carousel controls, GPS fallbacks, persistence, all themes/3D, real graphics
loss/restoration and no-WebGL browsing. Physical iOS/Android field checks remain.

## Glass presentation follow-up — 13 November 2026

- Added `src/glass.css` after the existing editorial stylesheet. Floating panels,
  map controls and focused labels use an 8% white fill, a 12px/saturate(120%)
  backdrop, thin translucent borders and quiet shadows. Tree rows use 6% white
  with a 10% hover state, without another blur layer. Corners are 14–18px at
  default text size; the numbered tree indicators remain circular.
  The sheet edge is an inset outline, so it cannot feed a border's height back
  into the existing measured Peek state. Keyboard focus uses a high-contrast
  white outline; saved/failed device icons use readable green/light-gray tones.
- The existing mode and three live estimates form one desktop row with small
  dividers. The mode is slightly smaller and medium-weight, with no badge fill.
  Mobile/enlarged text wraps naturally. No sample counts, distances or durations
  are hardcoded, and no route calculations or event handlers changed.
- Desktop sidebars now span 420–460px using the existing fluid 30vw rule, with
  rem-based limits for text enlargement. Tablet sizing, independent scrolling,
  mobile half-screen sheets, safe areas and measured map padding remain intact.
- Quick selectors, secondary actions, tree rows, gallery counter and map labels
  share the same restrained treatment. Start/Resume stays solid UOW red and the
  visit action stays green. Pinned reading bars use a local translucent navy
  scrim to separate their labels from scrolling content.
- Light/Aerial apply optical brightness reduction behind floating surfaces only,
  preserving readable white text without a map-wide overlay. A native screenshot
  test over a uniformly white backdrop measures 4.83:1 for secondary text. Reduced
  transparency and browsers without backdrop filters receive a readable navy
  fallback. Existing reduced-motion behavior remains active.

Files for this follow-up: `index.html`, `src/glass.css`, `tools/glass-qa.mjs`,
updated existing QA tools (sidebar, save status, viewport diagnostics and isolated
scene setup), `AGENTS.MD` and these notes. Application JavaScript, routes, GIS, tree data, GPS, storage
formats and carousel interactions are unchanged.

New glass QA covers nine viewport sizes, all four live route modes, desktop
single-line estimates, narrow-screen wrapping, 200% text, bright-map contrast,
reduced transparency and no automatic GPS request. Captures: `.qa/glass-*.png`.
All 27 unit tests and all 12 browser QA scripts passed, including walking/GPS
fallbacks, persistence, real WebGL recovery, 3D occlusion and no-WebGL browsing.
Physical Safari/Android readability and GPU/battery impact remain field checks.

## Phase 1: Campus scene and camera

- Global OpenMapTiles buildings are clipped to `UOW_boundary.geojson`, including
  crossing footprints and courtyards. No local buildings file is requested.
- A single lightweight geometry worker prepares clipped buildings. The stepped
  outside-campus tint/mask and its computation have been removed completely.
  There is no second map canvas or animation loop.
- Slate-blue 3D buildings use provider heights, a restrained light and vertical
  gradient at 95% opacity. Ground routes remain behind building faces; tree/GPS
  overlays remain readable. Genuine building names appear progressively at zoom 18+.
- Camera helpers use bounded eased transitions and respect reduced motion.
  Vector-tile completion and idle events schedule one debounced scene update;
  they do not rely on content-only events or a subsequent user map gesture.
  Existing paths, bearings, geolocation and walking calculations are unchanged.

Files: `src/map-theme.js`, `src/map-view.js`, `src/campus-scene.js`,
`src/campus-scene-worker.js`, `src/vendor/`, `index.html`.

Limitations: the supplied boundary is explicitly indicative, with uncertainty of
tens of metres. It is not a cadastral outline. Names depend on available provider
names/education POIs. No campus mask, perimeter stroke or outside blur is rendered.
Heights and imagery are provider estimates. Aerial adds vector buildings only when
3D needs them.

## Phase 2: Mockup layout and controls

- Soft white surfaces with slight transparency, navy Montserrat type, UOW-red primary actions
  and consistent spacing replace the stacked dark-card presentation.
- One summary renderer supplies the existing Your walk statistics and a compact
  Map Tools variant. The latter uses actual visited progress and reuses the header's
  remaining-distance/duration estimates. Values update
  without replacing a focused action. Statistics use two aligned rows (values
  above labels) across three columns, including phones. They stack only when
  highly enlarged text cannot fit readably.
- In the main summary, Resume, New walk and Done share one horizontal row. Map
  Tools places its red primary above the two soft-grey secondary actions. During an
  active walk, the inspector offers Pause; an untouched preview offers Start walk.
  Opening the inspector never pauses or replaces a route.
- A recognizable phone with a green check replaces the repeated saved-status line.
  It turns gray with a failure indicator when saving is unavailable. Its accessible
  name reports the state without relying on colour. Compact captions stay on one line;
  With stops retains the full elapsed-time explanation in its title.
- Existing settings controls live inside the inspector's Advanced settings
  disclosure, with quick basemap and perspective segments always available.
  The underlying sheet is temporarily hidden/inert, retaining its snap state.
  Padding follows the visible inspector and restores the sheet's free map area on
  dismissal. The current geographic view is preserved. Landscape uses a narrower
  side inspector to keep a useful map visible. Inspectors stay beside a vertical
  toolbar or below a wide toolbar; portrait tools use a compact horizontal group.
  CSS also caps the sidebar to the viewport before adaptive JavaScript catches
  up during a fast resize, preventing transient horizontal overflow.
  Arrival distance and its compact number/unit input share one row at every size.
  The full accessible label is retained when the visual label shortens at large
  text sizes. Extra preferences use native disclosure; Map Guide is removed.
  Fit walk sits in the Map Tools heading beside Close and leaves the inspector
  open, fitting around its current size. The input has no unit divider.
- There is one Map Tools entry point at top-right. Removed the duplicate Settings
  button/link; the walking menu remains available in both reading and overview.
  The arrival number is centred inside its input.
- Buildings and route visibility, plus optional auto-centre selection, are saved
  using compatible additions to the existing settings. Missing keys retain today's
  enabled behavior. Explicit Find on map/Fit walk always remain available.
- Buildings On/Off applies only to 2D. Its row is hidden in 3D, which always shows
  available building extrusions, including after theme changes. Returning to 2D
  restores its previous visibility choice. The drawn campus contour and its legend
  item are removed; the outline data still clips buildings and sets movement limits.
- Basemap (Dark / Light / Aerial), Buildings and Walk route now use native radio
  segments matching the 2D/3D treatment. They support keyboard arrows and clear
  focus/selected states. Labels reflow independently of the single-line selectors;
  constrained enlarged text uses named basemap icon tabs. No dropdowns remain in
  Map layers. Smaller headings, 14px control text and tighter spacing reduce panel
  height while retaining 44px touch targets.
- Map movement limits now come from the supplied outline's bounding box, doubled
  in both width and height around its centre. Limits are independent of screen size
  and survive theme changes. Boundary loading failure retains the existing fallback.
- Native persistent padding centres the map in the available area through sheet
  gestures, inspector/menu changes, zoom and 2D/3D. A small rectangle calculation
  avoids floating controls; updates wait for in-flight camera movement to finish.
  Fit Walk accounts for panel space once, avoiding duplicate padding. This follows
  [MapLibre's camera padding API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setpadding).
- Location, layers and zoom use floating white controls. The existing draggable
  sheet keeps its three snap states; summary height follows its contents. A stable
  layout threshold prevents the zoom group's reflow from oscillating.
- The canvas has a small viewport overscan. A ResizeObserver watches the map
  container itself, and its measured width/height drive native resizing. Rotation,
  browser chrome changes and container-only resizing cannot leave stale-sized
  canvas strips. No redraw is requested while sizes and camera padding are stable.
- Original posters remain uncropped and can still be enlarged. Common/scientific
  names now overlay a soft navy fade at the image's lower edge. The gallery offers
  a real photo and the complete original poster. Overview groups Family and
  identifying features; Plant resources preserves every link in compact rows.
  Equal-width accessible tabs use a red active underline and keyboard arrows.
  The reading header and Map/visit/Previous/Next row remain pinned while content
  scrolls. Previous/Next share a quiet surface in the right third of their row,
  with named arrow controls where labels cannot fit. The green
  visit action has a wider icon/label gap. Reading/navigation return behavior stays.
- Attribution is a section inside Map layers. The native control continues
  updating live provider credit content there; its popup wrapper is detached.
  OpenFreeMap/OpenMapTiles/OSM and NSW imagery links survive theme changes. The
  static path credit remains available without WebGL. Credits now use smaller,
  zoomable 11px text. No separate attribution
  button, popup or five-second timer remains.

Files: `index.html`, `src/editorial.css`, `src/walk-experience.js`, `src/map-view.js`,
and shared progressive-detail/control styles in `src/midnight.css` / `src/walk.css`.

Preserved: all four walk modes, walking network and data, GPS/heading, follow,
arrival confirmation, skipping/rerouting, pause/save/restore, visited progress,
original poster treatment, all basemaps and optional 3D, full provider attribution
inside Map layers, and outside-tap dismissal without navigation
or camera changes. No permission requests were added on load. Static hosting and
GitHub Pages subpaths need no build or API key.

## Phase 3: Verification and preview

### Adaptive sidebars, markers and carousel — 13 November 2026

- Desktop uses `clamp(25rem,30vw,28.75rem)`; tablet uses
  `clamp(20rem,38vw,23.75rem)`. At default text size those match the requested
  400–460px / 320–380px limits. Tablet padding is 20px; mobile is 16px. Desktop
  padding grows from 20 to 24px. Home sidebars fit their content, while browse and
  reading areas scroll independently. The mobile half-screen cap remains.
- More spacious desktop typography/overview grouping and inline estimates retain
  compact tree rows. Existing observers update map padding from measured panels;
  resizing never changes the geographic view or walk progress.
- Removed the white carousel arrows. The real image counter remains, alongside
  touch swipe, mouse drag and Left/Right/Home/End navigation. Enter/Space enlarge;
  vertical scrolling/pinch zoom stay native. Pointer drags never trigger a photo
  click, focus survives image changes, and fade transitions respect reduced motion.
- Thin cyan outlines and subtle glow retain all marker state colours. Marker size
  responds to zoom and free map width. Crowded lower-priority stops/dots are hidden
  through native display filters and reappear as space permits; coordinates and
  source tree/route geometry are unchanged. The list always retains every tree.
  Retained circles always keep their centred number; the native symbol pass does
  not separately hide numbers after the circle layout has resolved collisions.
- A small pure layout helper places label-only GeoJSON in clear screen positions,
  avoiding circles, other tree labels, visible controls/panels and route strokes.
  The focused pill shares this placement and only displaced labels get connectors.
  Path lines necessarily meet stop locations; markers cover these intentional joins.
  No path is moved or rerouted for appearance. Work is limited to camera/layout/data
  changes, at most 10Hz during gestures, with no idle annotation loop.
  Diagonal fallback positions keep the focused pill clear of a nearby toolbar and
  approaching path at screen edges, using a short connector when needed.

Files: `index.html`, `src/editorial.css`, `src/walk-experience.js`,
`src/map-view.js`, `src/map-label-layout.js`, geometry unit tests,
`tools/adaptive-map-qa.mjs`, viewport QA, `AGENTS.MD` and these notes. No tree,
network, boundary, original media or storage formats changed.

Validation for this follow-up includes 14 viewport sizes from 320 to 1600px,
200% text, retained stop numbers, unchanged source geometry, actual touch swipe,
mouse drag, keyboard navigation and vertical reading scroll. The three basemaps
restore annotations, and the settled idle probe reports no repeated layout work.
Physical Safari/Android sensor and outdoor performance testing remains a field check.

### Progressive Map Tools follow-up — 13 November 2026

- Added one quiet grey progress surface with actual visited count and a small
  accessible SVG progress ring. Remaining distance and duration reuse the existing
  header estimates; no route calculation, GPS or persistence behavior changed.
- The original Start/Resume/Pause/Explore handler remains the primary red action.
  New walk and Done retain their original handlers in equal-width grey buttons below.
  The main walk summary retains its previous layout and elapsed/distance data.
- The original Dark/Light/Aerial and 2D/3D controls share a compact quick-controls
  group that wraps by available space, keeping each selector on one line.
- Arrival, auto-centre, Buildings, Walk route and additional preferences now sit
  inside one initially collapsed native disclosure. Existing nodes/IDs, settings
  events, 2D/3D rules, localStorage and provider credits remain intact.
- White Montserrat surfaces, 10–12px radii at default text size, restrained dividers
  and 180ms feedback replace the previous always-expanded settings presentation.
  Desktop height follows content; mobile retains the half-screen maximum and scrolls
  when enlarged text or a short viewport needs it.

Files: `index.html`, `src/walk-experience.js`, `src/editorial.css`, existing UI QA
updates, `tools/progressive-tools-qa.mjs`, `AGENTS.MD`, and these notes. Captures:
`.qa/progressive-tools-mobile.png` and `.qa/progressive-tools-desktop.png`.

### Plant detail and map focus follow-up — 13 November 2026

- Replaced focused native name text with one lightweight white pill beside the
  selected native marker. Placement flips around screen edges and avoids visible
  panels and controls. It hides when its marker is obscured and no clear placement
  remains; selection and camera behavior are unchanged. No continuous idle loop.
- Removed the UOW favicon; the browser tab retains its plain text title.
- Added Overview / Plant resources tabs with ARIA roles, arrow/Home/End keys,
  a red underline and compact resource rows. All existing URLs and botanical data
  remain unchanged. Only the selected panel enters keyboard navigation.
- Bounded status notices independently of the responsive layout callback, fixing
  transient horizontal overflow during rapid desktop-to-phone resizing.
- The hero shows common/scientific names over a navy fade, stop badge, image count
  and previous/next image controls. Each tree has two supplied asset views: its
  extracted photograph and uncropped identification poster. Counts reflect those
  actual views, rather than the mockup's illustrative three-photo count.
- Added reproducible 640px WebP photo variants using the existing Pillow tool;
  all 49 trees now have seven optimized variants (343 total, 14.82 MB). Originals
  still load only on explicit poster enlargement. No runtime image dependency.
- Reading header, tabs and bottom actions stay visible while content scrolls.
  The 50% mobile cap remains. Short landscape switches to named icons, keeps the
  reading header/action row, and moves the walk menu there; the repeated brand
  header gives way to reading space. The same data remains in Map Tools.

Files: `index.html`, `src/map-view.js`, `src/walk-experience.js`,
`src/editorial.css`, `tools/optimize-images.py`, the optimized manifest and new
photo variants, existing QA updates, `tools/plant-detail-qa.mjs`, focused-label
unit tests and `AGENTS.MD`. Captures: `.qa/plant-*.png`.

### Compact layout audit follow-up

- Mobile sheets now stop at 50% of the current visual viewport, with a roughly
  45% half state. Reading and browsing scroll inside the sheet; the header can
  shrink and scroll on short screens or enlarged text. The portrait Map Tools
  pane shares the half-screen limit. Desktop sidebar heights are unchanged.

- Removed accumulated detail margins and excessive tree-row padding. Reduced
  headings, summary values, thumbnail sizes, rounding and desktop panel widths.
  Settings selectors retain their single-line form with less track padding.
- Primary buttons now use the existing 44px minimum rather than extra padding.
  Important botanical/GPS labels remain at least 14px; browser text enlargement
  and responsive reflow remain enabled. No information or actions were removed.
- Fixed the Outdoor theme's dark title on the navy header, with a contrast
  regression assertion in the existing UI audit suite.
- At the sampled 375px layout: reading header 99 → 77px, browse row 95 → 79px,
  Start/Resume button 50 → 44px and the same Map Tools state 661 → 610px.
  These are measured outcomes, not fixed layout dimensions.

Files for this follow-up: `src/editorial.css`, the existing inspector width cap
in `src/walk-experience.js`, `tools/ui-audit-qa.mjs`, and this document. Routing,
GIS data, storage formats, GPS and map rendering are unchanged. Captures:
`.qa/layout-before-*.png` and `.qa/layout-after-*.png`.

Development tools are separate from the static application. `py tools/preview.py`
serves current local assets on port 8765 without stale application caching; public
map tiles keep their own browser caching. The CDP transport waits for a new document
to commit before evaluating readiness, so it cannot accidentally test an old page.

- `node --test tests/*.test.cjs`: routing, saved-state validation, GPS/compass,
  theme and campus polygon regression tests.
- `node tools/maplibre-smoke.mjs`: native map, modes, GPS denial/retry, arrival,
  follow, skip/visit, all themes/3D, continuous width sweep, sheet gestures,
  failed images, rerouting, real context restoration and no-WebGL browsing.
- `node tools/midnight-qa.mjs`: five views across nine viewport sizes, enlarged
  text, visible controls/settings, 343 image variants, native scene and HTTP/console.
- `node tools/editorial-qa.mjs`: 320/375/430px, landscape, tablet and desktop;
  actual summary values, actions, responsive rows, layer persistence, camera
  preference, 200% text and reduced motion.
- `node tools/viewport-qa.mjs`: actual unobstructed map-centre hit testing across
  seven viewport sizes and enlarged text, geographic view preservation, reading
  focus, walk-menu placement, 2x3 statistics, forced 3D buildings and the restored
  2D preference. Captures: `.qa/viewport-*.png`.
- `node tools/refinement-qa.mjs`: edge-to-edge coverage at 320/375/390/430px,
  684x504, landscape, tablet and desktop at 1x/2x/3x density; container-only resize,
  one-row actions/captions, provider credits across all themes and reading-card
  placement at 200% text. Checks also cover Fit walk retaining the pane, green/gray
  phone save status, button/toolbar collisions, image name overlays and the
  narrow-viewport fallback before responsive JS runs. Captures: `.qa/refined-*.png`.
- `node tools/ui-audit-qa.mjs`: reading/overview return and stable session,
  menu bounds, warning contrast and collision-aware stop labels.
- `node tools/popover-qa.mjs`: real emulated touch dismissal, camera/selection
  preservation, in-pane credit links, keyboard access and focus return.
- `node tools/occlusion-qa.mjs`: screenshot pixel verification that 3D faces cover
  the route beneath them while exposed route sections remain visible.

Captures are in `.qa/editorial-*.png` and `.qa/midnight-*.png`.

Results: all 29 unit tests, the 59-layout walking smoke test (including graphics
recovery/no-WebGL), 45 five-view layouts, summary/settings checks and eight-size
reading/menu regressions passed. Warning text on the navy guidance header measures
11.74:1 base contrast. Touch dismissal and attribution access/focus checks passed.
Native 3D pixel occlusion checks passed. A settled 1.2-second inspector idle probe
recorded zero layout updates, rendered frames or building recalculations. Expanded
preferences also fit horizontally at 200% text. Fit walk now keeps the inspector
open without changing the route. Decorative horizontal rules are removed from
the inspector, summaries, browsing and detail sections. Smaller headings and
spacing keep important text at 14px and touch targets at least 44px. Planning and
summary shortcut icons use restrained amber, blue and green accents.

## Focused tree inline statistics

The floating tree label now keeps the name above one restrained metadata row:
tour stop number, approximate distance with the Lucide Footprints icon, and
Visited/Unvisited/Skipped status. Desktop wording is descriptive; sheet layouts
and narrow remaining map areas use compact labels. Full accessible names retain
the distance origin, path-versus-direct distinction and GPS context.

At default text size the row uses 13px local Lucide masks, 12px medium-weight
Montserrat, 8px spacing, muted white and thin vertical separators. These use rem
units to respect text enlargement. There are no extra metadata pills or surfaces.
The existing focused-label button, native marker interactions and camera behavior
remain intact. Placement reserves the larger two-line label, searches a bounded
clear area and uses the existing connector when needed; it hides if a short
landscape map has no room without obscuring paths, markers or controls.

Distance uses the existing walking graph and origin selection. A metadata cache
invalidates when the origin, stop order, network or visit/skip state changes;
camera updates reuse it. GPS and status changes refresh the existing label without
creating a new location watch, altering a session or requesting permissions.

Files: `index.html`, `src/map-view.js`, `src/map-label-layout.js`,
`src/walk-experience.js`, `src/glass.css`, four small local SVGs and their README,
`tests/map-label-layout.test.cjs`, `tools/marker-stats-qa.mjs`, the updated
name-only assertion in `tools/plant-detail-qa.mjs`, and `AGENTS.MD`.
Captures: `.qa/marker-stats-mobile.png` and `.qa/marker-stats-desktop.png`.

Validation: 30 unit tests and JavaScript syntax checks pass. The focused-label
suite covers eight viewport shapes, exact icon/text sizing, responsive wording,
live visit/skip/GPS values, cached calculations, all three themes, native click
behavior, 200% text and unchanged walking state. All 14 Chromium browser suites
pass, including eleven tree-panel layouts, the 59-layout walking/GPS smoke test,
Full Walk crowded stops, all themes/3D, real graphics recovery, no-WebGL browsing,
popover dismissal, live attribution and native 3D route occlusion. Physical
iOS/Android sensor and outdoor testing remains a field check.

## Matte plant reading and campus path contrast

Plant details use the requested Dark Frosted Glass surface: rgba(25,39,52,.78),
one 12px outer blur, a soft edge and a restrained shadow. The repeated title,
walk-mode badge and header statistics are hidden only while reading. Back/GPS
remain compact; the active walk menu moves into that navigation row and returns
to guidance afterward. Desktop dimensions and other app views remain unchanged.

The real photo/poster gallery retains its names, gradient, Stop badge, counter,
pagination, gestures and enlargement. Equal-width tabs use a sage underline.
Family and identifying features sit on minimal translucent sections with small
icons. The Map/green visit/Previous/Next row stays pinned. Inner sections do not
add blur; reduced transparency has a solid matte fallback. Reading continues
scrolling naturally within the existing half-height mobile sheet limit.

Campus paths also have slightly wider, brighter, more opaque strokes and one
soft contrast halo. Ordinary footways are stronger than tagged sidewalks and
crossings; the red active tour remains dominant. Both path layers follow the
existing Campus paths setting and restore correctly across all basemaps. Heights,
routing data, tree coordinates, attribution and navigation are unchanged.

Files: `src/glass.css`, the reading-menu placement in `src/walk-experience.js`,
path layer styling/visibility in `src/map-view.js`, the existing plant-detail and
viewport QA tools, and these notes/`AGENTS.MD`. No dependencies were added.
The QA helpers retain request URLs in console diagnostics and wait for completed
native annotation placement before checking focused labels.

Validation: all 30 unit tests, script syntax and all 14 Chromium browser suites
pass. Checks include all-theme path/halo visibility and 3D ordering, fourteen
plant-card layouts including 500/600px, portrait/landscape, desktop and 200% text.
Gallery/tab/resource navigation, pinned controls, touch sizes, unchanged other
views, saved walks and reduced-transparency behavior pass. Simulated portrait
and landscape safe areas (including 640px and 844px phone layouts) preserve
button content and avoid cutouts/overflow. Flat scrims prevent scrolled copy
showing through the spacing beyond pinned controls. Captures:
`.qa/plant-overview.png`, `.qa/plant-resources.png`, `.qa/campus-paths-*.png`.
Additional review captures: `.qa/matte-detail-*.png`. Physical iOS/Android checks
remain pending; these are desktop Chromium emulation results.

## Campus collection browser

The Trees view follows the supplied navy exploration layout: a clean UOW header,
shared Walk/Trees navigation, full-width icon search, four compact filter chips,
live result count and A–Z/nearest/tour-order sorting. Cards use optimized photos,
common/scientific names, actual tour stop numbers, walking distance and visit
icons. Selection has a restrained red outline and tint. Desktop/tablet results
scroll independently of the header and search controls.

Selecting a card or native marker keeps the browser open, highlights the same tree
and uses the existing smooth, panel-aware camera. One focused map label now offers
a photo, name, distance/status and details chevron in Browse; narrow views retain
compact accessible metadata. Its image uses local WebP variants with a glyph
fallback. A separate 44px card-details action also opens the existing reader,
including when WebGL is unavailable. Tour order/targets, visited keys and saved
sessions are unaffected by search, sorting or selection.

Mobile retains the collapsible half-height sheet. Sorting shares the search row
and the count sits beside Trees when space permits. Enlarged text moves the same
sort control into its own row with keyboard focus preserved, and filters reflow.
The mobile panel scrolls naturally so controls cannot strand the tree list.
Short sidebars use that same single-scroller fallback when measured controls and
one result cannot fit. Safe-area side padding and content-width filter queries
keep notched landscapes usable without a device-specific breakpoint.
Touch search controls use 16px text at default scale. The Walk navigation reuses
the original planning/active-walk behavior; plant details keep the matte reader.

The map retains its sources, imagery, clipped buildings, path hierarchy, markers
and geometry. Tour lines use thin UOW-red dashes with a restrained highlight. A
compact north compass joins the right-hand map controls; it changes bearing only,
using existing MapLibre easing and no extra location/heading listeners.

Files: `index.html`, `src/walk-experience.js`, `src/map-view.js`, `src/glass.css`,
`tools/browser-design-qa.mjs`, the no-WebGL reader check in
`tools/maplibre-smoke.mjs`, and these notes/`AGENTS.MD`. No dependencies or storage
format changes. Review captures: `.qa/browser-320.png`, `.qa/browser-390.png` and
`.qa/browser-1440.png`.

Validation: all 30 unit tests, script syntax checks and 15 Chromium browser suites
pass. The targeted browser suite covers search/filter counts, sorting, stable
progress, preview and direct details, native selection, themes, compass and
fourteen responsive/text layouts. It also verifies keyboard focus when moving
sorting controls, touch input text, notched safe areas and reaching the last tree
in short landscapes. Native graphics loss/recovery, no-WebGL reader access,
walking/GPS failures, all basemaps/3D, saved progress and prior card/gallery flows
remain covered. Physical iOS/Android testing is still a separate field step.
A settled 1.2-second browser probe recorded zero repeated layout updates,
focused-label updates or walking-leg calculations. Final review captures are
`.qa/browser-final-1440.png`, `.qa/browser-final-390.png`,
`.qa/browser-final-320.png` and `.qa/collection-home-desktop.png`.

## Change walk planner and route exit

Change walk retains the native disclosure and original select IDs, with a compact
matte navy surface, soft borders and local Lucide route/location/chevron/X icons.
The header has Change walk on the left and a separate 44px close button on the
right. It avoids nested interactive controls. The planner stays open after
choosing a walk, and scrolls into view when needed. Choices show
walking-network duration estimates including stops; the full-tour estimate omits
stops already visited. Calculation is cached by origin, visited state and network,
with no camera-driven recalculation.

X intentionally exits the selected tour: it clears route, target, repeated-path
and endpoint overlays, stops navigation/GPS/timing and keeps visited history.
The map fits the entire tree collection using the existing padded camera helper.
All canonical points render unclustered in this state, without invented tour
numbers or moved coordinates. Native source/feature state and map settings remain
in use. Choosing a walk restores the normal route, numbering and clustering.

An additive exploring status in the existing V1 session preserves this empty-route
choice across refresh, reopening and basemap switches. Start from alone does not
silently choose another walk. Details and Previous/Next continue working with
the whole collection when no route is selected. Visited history remains visible
in the existing progress widget. Existing settings/storage keys remain compatible.

Files: `index.html`, `src/walk-experience.js`, `src/walk-core.js`, `src/map-view.js`,
`src/glass.css`, four small Lucide SVGs plus their README, the saved-state unit
regression, `tools/change-walk-qa.mjs`, and these notes/`AGENTS.MD`.
No framework, build step, GIS changes or new runtime dependencies.

Validation: all 31 unit tests, script syntax checks and 16 Chromium browser suites
pass. The planner suite covers route estimates/cache, manual starting trees,
no-route persistence, all 49 native marker IDs and fit, basemap/context recovery,
unrouted Previous/Next, thirteen responsive/text layouts, keyboard activation and
stopping an active GPS session. The cleared state also passes an actual no-WebGL
reload, tree browsing/details/Next and subsequent native restoration. Final visual
checks confirm separated header text/X at 200% text. Captures are saved as
`.qa/change-walk-mobile.png` and `.qa/change-walk-desktop.png`.
Additional captures: `.qa/change-walk-enlarged.png` and
`.qa/change-walk-exited.png`. Physical iOS/Android sensor tests remain pending.

## Remaining field checks

Desktop Chromium with software WebGL and emulated mobile input is available here.
Physical iOS Safari/Android Chrome, hardware GPS/compass, notched-device safe areas,
virtual keyboards and outdoor battery/performance measurements still require real
devices. The inspector scrolls internally when the viewport/text size cannot fit
all settings; it does not compress touch targets to avoid scrolling.

Recommended next: test one campus walk on each mobile platform, validate the
indicative boundary against an authoritative campus GIS export, and inspect provider
building names/heights against campus landmarks. Keep any further visual changes
small and guided by those field findings.
