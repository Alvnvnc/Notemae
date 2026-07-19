# ScentSphere Interactive Landing Page Plan

Status: planning only. No implementation in `fe/` has been changed.

Last researched: 2026-07-17

## 1. Goal

Rebuild the ScentSphere frontend with the same interaction concept and spatial
composition as the AnnaTwelve homepage, while keeping ScentSphere's identity,
copy, product flows, and visual assets original.

Priority order:

1. A full-viewport interactive background connected to pointer and touch input.
2. A high-fidelity layout: fixed header, oversized collection rail, restrained
   footer/progress UI, overlay menu, loader, and edge-to-edge canvas.
3. Preserve the AI consultation, recommendation, catalogue, search, loading,
   empty, and error flows already in `fe`.
4. Provide mobile, reduced-motion, keyboard, and WebGL fallbacks.

This is inspiration-level layout fidelity, not a brand clone. Do not copy
AnnaTwelve's logo, photography, videos, fragrance names, text, or production
assets.

## 2. Reference Breakdown

- Primary: <https://www.annatwelve.com/en>
- Supporting: <https://www.awwwards.com/sites/annatwelve-fragrances>

The production page and bundle were inspected directly. Key observations:

- The homepage is locked to one dynamic viewport with semantic UI above a fixed
  WebGL canvas.
- On desktop, the collection list is positioned near the lower edge and rotated
  270 degrees around its lower-right origin. On portrait it becomes a normal
  vertical list.
- The fixed header has a logo/descriptor at left and two links plus a menu
  trigger at right.
- The desktop footer has a welcome label, thin progress line, info action, and
  sound control. Mobile removes most secondary chrome.
- The background is a looping video texture, not a generic 3D object. Pointer
  velocity feeds a flow map; a fragment shader uses it to distort video pixels.
- Scene transitions use grayscale noise, a radial reveal mask, image scale, and
  an approximately two-second GSAP transition.
- Hover focuses one collection item and reduces peers to about 15% opacity.
  Small item indices reveal with translate and opacity motion.
- A loader, full-screen menu, custom desktop cursor, and route covers complete
  the experience.
- The reference uses Montserrat, near-black, off-white, gray, GSAP, video, and
  WebGL. Awwwards identifies Vue as its application framework.

These interaction and layout concepts should be reproduced. Exact CSS and
branded media should not be copied.

## 3. ScentSphere Translation

### First viewport content

- Wordmark: `ScentSphere AI`
- Descriptor: `Fragrance intelligence`
- Utility links: `Catalogue` and `AI Consultant`
- H1: `Find your signature scent`
- Collection rail: `Citrus`, `Woody`, `Floral`, `Amber`, `Fresh`, `Musky`,
  `Spicy`, `Aquatic`, and `Gourmand`
- Rail indices: `.01` through `.09`
- Mobile CTA: `Discover your fragrance`
- Footer label: `Catalog-grounded recommendations`
- Footer actions: progress/status, `Info`, and optional sound

The nine scent families preserve the reference's rhythm while remaining useful
to ScentSphere. Selecting a family must populate catalogue filter/search state,
not lead to a decorative dead end.

### Existing flows to preserve

- Free-text profiles use `/v1/recommendations/from-text`.
- Structured recommendations fall back to `/v1/recommendations`.
- Catalogue search uses `/v1/fragrances`.
- Indonesian Rupiah formatting remains locale-aware.
- Current loading, empty, unavailable, and fallback messages remain represented.
- Backend configuration still comes from `runtime-env.js`.

Below the immersive viewport, continue with two unframed full-width bands:

1. `AI Consultant`: existing form and recommendation result.
2. `Catalogue`: search, family filtering, and fragrance results.

Do not turn page sections into nested cards. Individual fragrance results may
remain repeated cards or rows.

## 4. Technical Direction

### Recommended decision

Migrate `fe/` from dependency-free HTML/CSS/JS to a Vite + React + TypeScript
SPA, still built to static files and served by Nginx.

Reasons:

- WebGL resources, video state, loading, menu state, media-query changes, and
  cleanup need clear component lifecycles.
- React permits direct adaptation of proven patterns from the local reference
  without bringing in the Next.js server/runtime.
- Vite preserves the current static deployment boundary.
- Existing API integration can be ported without backend changes.

Recommended dependencies:

- `react`, `react-dom`, `typescript`, `vite`
- `three`, `@react-three/fiber`, `@react-three/drei`
- `gsap` plus `ScrollTrigger` only where scroll-linked motion is necessary
- `framer-motion` for loader/menu/UI state transitions
- `lucide-react` for menu, close, volume, mute, arrow, and search icons
- `vitest`, `@testing-library/react`, and `playwright`

Do not add Lenis initially. Native scroll is sufficient for the two below-fold
bands, while the reference homepage itself is viewport-based.

### Proposed structure

```text
fe/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  public/
    runtime-env.js
    media/
  src/
    main.tsx
    app/App.tsx
    app/app.css
    components/
      Header.tsx
      CollectionRail.tsx
      FooterRail.tsx
      OverlayMenu.tsx
      IntroLoader.tsx
      DesktopCursor.tsx
      AiConsultant.tsx
      CatalogueExplorer.tsx
      FragranceCard.tsx
    components/webgl/
      InteractiveBackground.tsx
      BackgroundScene.tsx
      FlowmapPass.tsx
      MediaPlane.tsx
      StaticBackgroundFallback.tsx
    hooks/
      useMediaQuery.ts
      usePointerVelocity.ts
      usePageVisibility.ts
      useWebGLSupport.ts
    lib/
      api.ts
      format.ts
      motion.ts
      scentFamilies.ts
    shaders/
      flowmap.vert.glsl
      flowmap.frag.glsl
      background.vert.glsl
      background.frag.glsl
      transition.frag.glsl
    types/fragrance.ts
    tests/
  Dockerfile
  nginx.conf
```

If implementation must remain vanilla, use the same boundaries as ES modules.
That is a fallback, not the preferred approach, because it reduces safe reuse
from `landing-page` and concentrates too much state in `app.js`.

## 5. Interactive Background Specification

### Layer model

Use a fixed canvas with `pointer-events: none` behind semantic DOM content:

```text
z-0   static poster / background color
z-10  WebGL canvas
z-20  contrast scrim and optional grain
z-30  page content and collection rail
z-40  fixed header/footer
z-50  custom cursor
z-60  overlay menu
z-70  loader/route cover
```

Avoid arbitrary values outside this scale.

### Media plane

Use an orthographic camera and one full-screen plane with CSS `cover`-equivalent
UV behavior. The same shader path should support an original short-loop video
or a high-resolution still.

Fragment pipeline:

1. Correct UVs for viewport and media aspect ratios.
2. Read a low-resolution flow texture driven by pointer velocity.
3. Offset media UVs with the flow vector.
4. Add extremely subtle time-based drift; the image must not visibly swim while
   idle.
5. Apply a vignette/scrim to guarantee text contrast.
6. Mix current and next textures through a radial noise transition.

### Flow map

Implement a 128 or 256 square ping-pong render target:

- Decay the previous flow each frame.
- Stamp normalized pointer position into the target.
- Encode pointer velocity in red/green and strength in blue/alpha.
- Smooth velocity with delta-time damping, not frame-dependent lerp.
- Clamp pointer re-entry jumps to prevent visual flashes.
- Stop updates after velocity settles and invalidate Fiber manually when useful.

Starting values:

```text
falloff:             0.30-0.38
pointer alpha:       0.16-0.22
dissipation:         0.94-0.97
velocity damping:    8-12 per second
UV distortion:       0.08-0.12
idle drift:          <= 0.006
```

### Scene transition

On family selection:

- Prepare the next texture before revealing it.
- Animate `uTransitionProgress` 0 to 1 over 1.2-1.8 seconds.
- Use a radial smoothstep mask perturbed by grayscale noise.
- Scale incoming media from about 1.08 to 1.00.
- Scale outgoing media from 1.00 to about 0.96.
- Crossfade labels in 250-400ms.
- Make transitions interruptible. A new choice replaces the pending target
  instead of queuing timelines.

Ship one hero asset first if family-specific media is not ready. Keep the data
model ready for multiple assets, but never duplicate the same file nine times.

### Input

Desktop fine pointer:

- Flow follows `pointermove` velocity.
- Hovering one family dims peers to 15-25% opacity.
- The `.NN` index rises 8-10px into view.
- Custom cursor expands only over actionable hero targets.

Touch/coarse pointer:

- No custom cursor.
- Touch drag may influence flow but must not block normal vertical scroll.
- Tap selects a family.
- Every action has at least a 44x44 CSS pixel hit area.

Keyboard:

- Arrow keys may move between families while focus is inside the rail.
- Enter/Space activates the focused item.
- Tab order follows header, rail, CTA, then below-fold content.
- Focus rings remain visible.

## 6. Visual System

The UI Pro Max search classified the desired pattern as an
`Immersive/Interactive Experience` with high motion and spacious density. Use
that structure with original ScentSphere brand choices.

### Suggested tokens

```css
--color-bg: #101310;
--color-bg-elevated: #191d19;
--color-text: #f4f2ec;
--color-text-muted: #a9ada4;
--color-line: rgba(244, 242, 236, 0.24);
--color-botanical: #55705b;
--color-amber: #d0a45f;
--color-error: #d96b64;
--color-focus: #f0c879;
```

- First viewport: dark photographic green/black, off-white, neutral gray.
- Amber is a functional accent, not the dominant background.
- Use Montserrat or a locally hosted metric-compatible sans.
- Body copy is 16-18px at 1.5-1.65 line height.
- UI labels are 12-14px, never below 12px.
- Use zero letter spacing for normal copy; positive tracking only for short
  uppercase labels/wordmark.
- Cards use 0-8px radius.
- Do not add gradient orbs, bokeh, glass cards, or nested card layouts.

### Layout values

```text
Mobile gutter:         24px
Tablet gutter:         40px
Desktop gutter:        6.25vw, capped where needed
Header desktop top:    about 8dvh
Header mobile top:     24px + safe-area inset
Rail desktop bottom:   16-18dvh
Footer desktop bottom: 5-6dvh
Section max width:     1280-1440px
```

## 7. Responsive Composition

### Desktop, 1440px and wider

- Full-bleed canvas; media focal point stays center/right.
- Fixed header aligned to a 16-column rhythm.
- Rotated collection list.
- Full footer rail and progress line.
- Show a restrained hint that content continues below the viewport.

### Tablet and 768-1023px landscape

- Keep the canvas and fixed header.
- Use rotation only when the measured rail bounding box fits.
- Reduce footer details.
- Respect safe areas and orientation changes.

### 375-767px portrait

- Use a normal vertical list in the lower half of the viewport.
- Reduce type and list gaps while preserving 44px targets.
- Keep menu and primary CTA; hide secondary header links if needed.
- Prefer the static poster on low-memory devices and progressively enable flow.
- No horizontal scroll or content hidden behind browser UI.

### Landscape phone

- Use a simplified static hero and compact two-column rail.
- Do not show a forced `rotate your device` blocker.

## 8. Original Asset Plan

Art direction:

- Macro botanical or perfume-material scene with visible texture and depth.
- Dark foliage, water droplets, translucent resin, glass, or vapor may express
  fragrance without looking like generic stock photography.
- Keep the subject sharp and inspectable; avoid atmospheric-only blur.
- Reserve calm negative space for header and rail.

Deliverables and budgets:

```text
hero-botanical.avif    1920x1080, target <= 300KB
hero-botanical.webp    1920x1080, target <= 450KB
hero-poster.webp       1280x720,  target <= 250KB
displacement.webp       512x512,  grayscale, target <= 60KB
optional hero-loop.mp4 1280x720,  6-8 seconds, muted, target <= 1.5MB
```

Declare dimensions/aspect ratios, preload only the first poster, and lazy-load
alternate media after the first viewport is interactive.

## 9. Reuse From `/home/ubuntu/project/landing-page`

Adapt patterns, not its demo brand/content:

- `src/components/three/hero-canvas.tsx`: client canvas containment, DPR bounds,
  high-performance renderer options, and reduced-motion frame-loop switching.
- `src/components/three/scene-object.tsx`: delta-time damping, normalized pointer
  input, passive listeners, and cleanup. Replace the object with media/flow.
- `src/components/loader.tsx`: progress lifecycle and reduced-motion exit. Use
  actual critical-asset state instead of simulated progress.
- `src/components/nav.tsx`: overlay menu state, scroll-lock cleanup, motion
  structure, and 44px menu trigger.
- `src/components/cursor.tsx`: fine-pointer detection and RAF smoothing. Keep
  native cursors for controls and forms.
- `src/components/smooth-scroll-provider.tsx`: reference only for GSAP ticker
  cleanup; do not add Lenis in phase 1.
- `docs/3d-and-animation.md`: documentation conventions for optimization,
  fallbacks, and motion behavior.

Do not copy `public/models/hero.glb` into `fe`; the 3D clay object does not match
the target background technique or fragrance art direction.

## 10. Implementation Phases

### Phase 0: Baseline and fixtures

- Capture current `fe` screenshots at 1440x900, 1024x768, 390x844, and phone
  landscape.
- Record API request/response fixtures for catalogue and recommendation.
- Add a smoke checklist for both Qwen and deterministic fallback paths.
- Confirm current Docker Compose startup and Nginx runtime-env behavior.

Exit criteria:

- Existing behavior is reproducible before migration.
- API payloads are recorded independently of current DOM rendering.

### Phase 1: Vite migration without redesign

- Add Vite/React/TypeScript configuration.
- Port `app.js` into typed API and UI modules.
- Reproduce existing consultation and catalogue behavior.
- Change `Dockerfile` to a Node build stage followed by Nginx static serving.
- Move `runtime-env.js` into `public/` and keep it deployment-editable.

Exit criteria:

- Existing journeys pass against the live backend.
- `docker compose up --build fe` still serves port 4173.
- No client secret enters the source or build output.

### Phase 2: Static high-fidelity shell

- Implement full-screen header, rail, footer, overlay menu, and original poster.
- Add responsive rotation/switching and design tokens.
- Add semantic H1, nav, list, links/buttons, and focus states.
- Place the existing product sections below the first viewport.

Exit criteria:

- Layout is close to the reference before WebGL is enabled.
- All content remains usable with the canvas deliberately disabled.

### Phase 3: WebGL flow background

- Add video/still texture plane.
- Build the ping-pong flow map and pointer-velocity hook.
- Pause rendering through page visibility and hero intersection state.
- Add DPR adaptation, resize handling, context-loss recovery, and poster fallback.
- Tune focal point and scrim against actual DOM content.

Exit criteria:

- Pointer input produces smooth localized distortion without layout shift.
- Canvas is nonblank on supported desktop and mobile devices.
- WebGL failure leaves the poster and every action usable.

### Phase 4: Transitions and interface motion

- Connect rail selection to family state and catalogue filters.
- Add radial noise transition once multiple original media assets exist.
- Implement item dimming/index reveal, menu transition, and real asset loader.
- Add custom cursor only for fine-pointer hero targets.
- Add simple opacity alternatives for reduced motion.

Exit criteria:

- Rapid selection does not queue or corrupt transitions.
- Escape closes the menu and focus returns to its trigger.
- No motion blocks form input, scrolling, or navigation.

### Phase 5: Product integration polish

- Connect selected family to catalogue queries or client filtering.
- Preserve search query/family state when moving through the page.
- Refine recommendation result hierarchy and alternatives.
- Add disabled/loading submit state, retries, and accessible live regions.

Exit criteria:

- The immersive rail leads to a real discovery action.
- Errors state what failed and how to retry.
- Repeated submission is prevented during pending requests.

### Phase 6: Verification and tuning

- Run unit tests, production build, Docker smoke test, and Playwright flows.
- Capture desktop/mobile screenshots and compare layout geometry.
- Run canvas pixel checks at rest and after pointer movement.
- Profile frame time, GPU memory, LCP, CLS, and bundle size.
- Test keyboard-only, landmarks, 200% zoom, reduced motion, static fallback,
  slow network, and landscape orientation.

Exit criteria: all acceptance criteria below pass.

## 11. Acceptance Criteria

### Visual fidelity

- First viewport is edge-to-edge and not inside a card.
- Header, rail, and footer align to one grid.
- Desktop rail is rotated; portrait composition is intentionally vertical.
- Background is a real fragrance/domain visual, not gradients or decorative
  orbs.
- ScentSphere is obvious within the first viewport.
- Text and controls do not overlap at baseline viewports.

### Interaction

- Pointer/touch feedback begins within 100ms.
- Hover/selection does not move surrounding layout.
- UI transitions stay around 150-400ms; scene transition is at most 1.8s.
- Important actions work without hover.
- Menu and scene transitions are interruptible.

### Accessibility

- Text and controls meet WCAG AA contrast.
- Icon-only buttons have accessible names and tooltips where unfamiliar.
- Targets are at least 44x44 CSS pixels.
- Focus order matches visual order and focus rings remain visible.
- Reduced motion removes flow, parallax, simulated loader delays, and complex
  reveals.
- Canvas is `aria-hidden`; information and actions exist in semantic DOM.
- Request status uses `aria-live="polite"`; errors include a recovery action.

### Performance

- CLS <= 0.10.
- Mobile LCP target <= 2.5s.
- Pointer rendering avoids long tasks and targets <=16ms work per desktop frame.
- Desktop targets 55-60fps; supported mid-tier mobile targets at least 30fps.
- DPR is capped at 1.5-1.75 and can drop on slow devices.
- Renderer pauses when the tab is hidden or hero is offscreen.
- Initial media respects the budgets in section 8.
- Alternate media and below-fold content are lazy-loaded.

### Regression safety

- All three current API endpoints keep their payload/error behavior.
- Rupiah formatting remains locale-aware.
- Runtime backend URL remains `window.__SCENTSPHERE_CONFIG__` driven.
- Nginx serves SPA routes/assets with appropriate cache behavior.
- No service key or provider credential exists in frontend output.

## 12. Test Matrix

Automated Playwright viewports:

```text
1440x900   desktop fine pointer
1024x768   tablet landscape
768x1024   tablet portrait
390x844    mobile portrait
844x390    mobile landscape
```

Required flows:

1. Loader resolves and hero controls become focusable.
2. Hover/focus a family and verify only peer opacity changes.
3. Select a family and verify catalogue state updates.
4. Open/close the menu with pointer, keyboard, and Escape.
5. Submit free-text consultation and render recommendation/alternatives.
6. Search catalogue and render results, empty state, and failure state.
7. Force reduced motion and verify there is no continuous canvas animation.
8. Force WebGL failure and verify poster fallback.
9. Move the pointer and verify meaningful canvas pixel change without a blank or
   single-color frame.
10. Resize/orient viewport and verify cover geometry with no overlap.

Manual device checks must include at least one iOS Safari device and one
mid-tier Android Chrome device. Headless desktop success is insufficient for
autoplay, context loss, touch behavior, and GPU performance.

## 13. Risks and Mitigations

- **WebGL/video delays interactivity:** paint the poster first, initialize WebGL
  after critical DOM, and progressively enhance.
- **Nine media files inflate bandwidth:** ship one hero asset initially and
  lazy-load only adjacent/selected media.
- **Rotated type clips at intermediate widths:** measure the rail and switch
  based on available block size, not only one breakpoint.
- **Custom cursor harms form usability:** limit it to fine-pointer hero targets;
  forms keep the native cursor.
- **Motion causes discomfort:** keep parallax away from body text and provide a
  complete reduced-motion path.
- **Migration regresses API behavior:** finish Phase 1 and lock fixtures/tests
  before starting visual work.
- **Reference assets create brand/legal risk:** create or license all
  ScentSphere media and preserve only layout/interaction concepts.

## 14. Definition of Done

The implementation is complete when `fe`:

- Opens with a ScentSphere-branded, reference-faithful full-screen composition.
- Uses an original interactive flow-map background with stable fallbacks.
- Connects its family navigator to actual discovery behavior.
- Preserves consultant and catalogue API journeys.
- Passes responsive, accessibility, performance, and regression checks above.
- Runs through Docker Compose at `http://localhost:4173`.

