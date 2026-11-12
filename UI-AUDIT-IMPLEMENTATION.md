# UI audit implementation

Implemented 12 November 2026 in the existing static MapLibre app. The agreed choices
are retained: 3D in Map tools, Location/Follow top-right, and a focused reading card
without a persistent navigation footer.

## Phase 1 — Safe walking and reading

- Walking opens as compact next-stop guidance on both desktop and mobile. View tree
  opens the original reading card; Back to walk restores guidance and Skip without
  changing the route, target, skips, visits or elapsed-time anchor.
- Reading retains the full poster, scientific name, family/features, links and green
  visit action in its normal scrolling position. Mobile dragging still opens/closes
  reading; explicit transient state gives desktop the same choice. No new saved state.
- Removed Full/Nearby route switches and their obsolete button CSS. A read-only mode
  badge shows the actual Quick/Casual/Full/Nearby selection. Planning remains in the
  existing home/new-walk flow, avoiding accidental replacement from a tree card.
- Weak GPS is named explicitly. Outdoor amber #805000 on #fafbfe measures **6.62:1**
  contrast; the warning icon and complete accessible explanations remain.

Files: `index.html`, `src/walk-experience.js`, `src/midnight.css`, `src/tree-card.css`.
Checks: stable-state reading round trips, correct badges, both layouts and the native
walking/GPS regression suite passed. No automatic permissions or visits were added.

## Phase 2 — Placement and home hierarchy

- Moved the existing 3D button into Map tools beside theme selection. It retains its
  ID, keyboard behavior, persisted setting and native 2D/3D rendering. Location/Follow
  and Map tools retain the top-right placement.
- Settings, Map tools and the walk menu anchor to their triggering button. They open
  above/below based on available room, remain within the visual viewport/safe areas
  and scroll internally when constrained. ResizeObserver keeps open menus aligned;
  a settled 1.2-second idle probe with a menu open recorded zero layout updates.
- Home groups the selected walk with tree count, distance and approximate duration
  above Start/Resume. Smaller introductory spacing and a shorter mobile title area
  reduce obstruction; desktop keeps its editorial introduction and stop preview.
  Change walk follows the main action; Browse trees remains secondary.
- Bottom-right SVG attribution, five-second idle collapse, provider links and outside
  dismissal are unchanged. Outside taps preserve view, sheet, selection, camera and walk.

Files: `index.html`, `src/walk-experience.js`, `src/midnight.css`.
Checks: menus at 320/375/390/430px, tablet, desktop and landscape passed, including
200% text and near-edge anchors. Real mobile/desktop touch dismissal and attribution
timeout, timer renewal and focus restoration passed.

## Phase 3 — Type and map legibility

- Important card metadata, scientific names, walking distance, GPS messages and detail
  distance are at least .875rem (14px at default text size), with natural reflow.
- Current/selected stops receive native circle ordering and higher label priority.
  Stop numbers use collision detection rather than forced overlap. Secondary names
  appear only at closer zoom and respect collisions; priority names remain prominent.
  This uses [MapLibre symbol sorting](https://maplibre.org/maplibre-style-spec/layers/#symbol-sort-key),
  without changing tree coordinates, route geometry or distance calculations.
- Existing data, network planning, settings/storage keys, fonts and image assets remain
  compatible. No new runtime dependency, framework or build requirement was introduced.

Files: `src/map-view.js`, `src/midnight.css`.
Checks: native label priorities/collision settings, unchanged geographic positions,
retained style-switch state, context recovery and building/route occlusion passed.
Dense physical tree locations can still require zooming; geographic points are not spread.

## Verification and limits

- **13 Node tests passed** for route budgets, arrival, restoration, sensors and rendering helpers.
- **59 regression layouts** including continuously varying widths and enlarged text passed.
- **45 additional five-view layouts** plus enlarged home/browse text passed without overflow.
- New `tools/ui-audit-qa.mjs` checks eight portrait/landscape/tablet/desktop sizes,
  stable reading returns, inert route badges, anchored settings/menus, 3D placement,
  warning contrast, 200% menus and label-coordinate invariants.
- Updated `tools/maplibre-smoke.mjs` for the explicit Back to walk flow. Existing
  `tools/popover-qa.mjs` and `tools/occlusion-qa.mjs` passed unchanged.
- Native live basemaps, GPS denial/retry, compass/arrival/follow/rerouting, summaries,
  saved progress, image failures, WebGL loss/restoration and no-WebGL fallback passed.
- Normal-use browser QA recorded no uncaught JavaScript, console or HTTP errors.

Physical iOS Safari/Android Chrome were unavailable. Device permission prompts,
real sensors, sunlight use, virtual keyboards, screen readers and battery behavior
remain field QA. Dense-marker selection and reading on actual campus phones are
the recommended next checks. This pass does not claim turn-by-turn or accessible routing.
