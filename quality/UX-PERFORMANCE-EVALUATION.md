# The Black Wolf Studio — UI, responsive, performance, and quality evaluation

Evaluated July 22, 2026.

## Executive assessment

The app has a distinctive, credible visual direction and a stronger-than-average responsive foundation. Public routes are consistently structured, route splitting works, error states are present, and the navigation shells show careful keyboard and mobile behavior.

It is not fully launch-ready. The highest-impact issues are a desktop home-hero collision, incomplete and inconsistent public contact information, conversion friction on membership/login flows, unnecessary Firebase and admin-style weight on public pages, undersized touch targets, and a quality command that cannot currently pass or run its browser audit without correction.

## Coverage and limitations

- Production build and static quality checks.
- Ten public/auth-entry routes at 390 × 844 and 1440 × 1000.
- Full-page screenshots, DOM/accessibility checks, overflow checks, browser errors, and local navigation/resource timing.
- Source review of marketing, member, and instructor shells.
- Authenticated member and instructor pages could not be rendered without a test account. `/member` and `/instructor` correctly redirected to login, so data-heavy authenticated workflows remain a source-only review.
- Timing was measured on a local unthrottled preview. It is useful for comparing architecture and detecting long tasks, not as a substitute for production mobile Core Web Vitals.

## What is working well

- All 20 route/viewport combinations had exactly one `main`, at least one `h1`, zero horizontal overflow, zero missing image alts, zero unnamed visible controls, zero unlabeled visible fields, zero duplicate IDs, and zero browser-console failures.
- The public visual system is cohesive: strong monochrome photography, restrained blue accent, clear card language, and consistent typography.
- Responsive cards and forms stack cleanly at 390 px. No clipped page content or sideways scrolling was found.
- The portal shell includes skip links, focus trapping, Escape handling, body-scroll locking, an inert background, responsive sidebar behavior, active navigation, and reduced-motion handling.
- Route-level JavaScript is lazy-loaded into 59 chunks. No JavaScript chunk exceeds the configured warning budget.
- Hosting cache policy is sound for hashed assets and `index.html`.
- Local cold-home rendering showed no long tasks; cached-route first contentful paint ranged from roughly 44–108 ms locally.

## Priority findings

### P0 — fix before launch

1. **Public contact information looks unfinished and conflicts across the site.** The contact page shows `hello@theblackwolfstudio.com`, “Phone number coming soon,” and “Studio location coming soon,” while the footer shows `contact@theblackwolf.studio`. Choose one real email/domain and either publish accurate phone/location/service-area information or remove those rows. This is the largest trust problem in the current public experience.

2. **The desktop home hero has a real readability collision.** At 1440 px the left copy crosses onto the black artwork: the end of “WITHOUT,” body copy, trust notes, and secondary CTA lose contrast or appear cut off. Make the copy and image true layout columns, or add a deliberate opaque/gradient copy surface. Do not let a full-bleed background determine text contrast.

3. **The quality gate is not trustworthy yet.** `npm run quality:full` stops on 43 lint errors. Thirty-four are Node-global errors because `scripts/*.mjs` is not assigned Node globals, five are unused server symbols, and four are React state-in-effect findings with render/performance implications. The browser smoke script also sends an invalid device-metrics payload (it includes `name` and omits required `mobile`) and deletes the temporary browser profile before Windows releases it. CI cannot currently prove the release is healthy.

4. **Verify the membership commercial data.** Plans are displayed as `$49 / annual`, `$199 / annual`, and `$299 / annual` while promising monthly classes and other ongoing benefits. If correct, make “billed annually” prominent. If these are monthly prices, fix the cadence immediately. Renewal/cancellation language is too far from the decision buttons.

### P1 — highest-value UI and performance work

1. **Public visitors preload authenticated infrastructure.** The entry HTML preloads Firebase and Auth chunks on every page; `firebase-vendor` is 545.5 KB raw / 160.6 KB gzip. Move auth/session/notification providers behind authenticated/login boundaries or lazy-load Firebase only when a route needs it.

2. **All 18 CSS files are imported from the root.** The build emits one 175.3 KB CSS file (30.7 KB gzip), so marketing visitors parse styles for reports, commerce admin, progression, bookings, notifications, and instructor workflows. Import route-specific styles with their route modules and keep only tokens/shell primitives global.

3. **Secondary-page heroes consume too much of the first viewport.** Events, membership, private training, contact, and programs use 430–540 px minimum heights plus 120 px top padding and very large headings. On desktop there is often no actionable content above the fold; on mobile the repeated dark hero pattern delays the actual product. Reduce compact heroes by roughly 25–35%, cap line length/font size, and place the route’s primary CTA in the hero.

4. **Mobile touch targets fail practical size expectations.** The menu button measures 36 × 26 px. Footer navigation links are about 19 px tall. Give the menu button at least a 44 × 44 px box and footer/action links at least 44 px of touch height on mobile.

5. **The login form is below the fold on mobile.** A returning member first sees a large marketing statement and only the sign-in heading at the bottom of an 844 px viewport. Put the form first on small screens or reduce the promotional panel substantially.

6. **Membership makes new customers “sign in to join.”** That label reads like a returning-user action. Use a plan-specific “Choose Begin/Train/Integrate” CTA and branch into create-account or sign-in afterward.

7. **The event page advertises events but shows a dominant empty state.** If no events are scheduled, offer a waitlist, email notification, recurring class alternative, or contact CTA. The current “No upcoming events are published yet” message makes the experience feel unfinished.

8. **The home page is too long on mobile.** Its full rendered height is 10,324 px. The content is good, but repeated philosophy/process/membership/AI sections dilute the main conversion. Shorten the mobile path, collapse supporting detail, and repeat one clear “Book an intro” action at decision points.

9. **The private-training desktop grid leaves most of the content area empty.** Only one package is available, but the card remains left-aligned in a multi-column region. Center or widen a single offer, or pair it with a comparison/FAQ/value panel.

10. **Small blue eyebrow text misses AA contrast.** `#5d738b` on `#f2eee6` measures about 4.23:1 and is used at roughly 12 px. Darken the blue for small text or increase size/weight enough to qualify as large text.

### P2 — polish and maintainability

1. Convert the 187.8 KB home background image to modern responsive formats and preload the actual likely LCP image. A CSS background cannot use responsive `srcset` and currently receives less explicit priority than the decorative hero mark.
2. Remove or compress deployed-but-unreferenced assets: `black-wolf-mark.png` (467.3 KB), `black-wolf-wordmark.png` (178.1 KB), and the unused 128.6 KB favicon.
3. Add per-route meta descriptions, canonical URLs, Open Graph/Twitter metadata, and prerendering if public search/social acquisition matters. Titles change by route, but metadata remains generic and client-side content depends on JavaScript.
4. Reduce stylesheet override debt: 18 files, 230 KB of source CSS, and 36 `!important` declarations make regressions harder to reason about.
5. Break up the largest operational pages (`InstructorAvailabilityAdmin`, `PrivateTrainingBookingPage`, `InstructorDiscountsAdmin`, `InstructorEventsAdmin`, and `InstructorReportsPage`) into smaller view/state modules.
6. Add interaction tests for the marketing menu, focus order, form validation, auth error states, purchase flows, authenticated tables, and keyboard use. The current browser smoke test checks settled DOM state but does not exercise workflows.

## Performance evidence

| Measure | Result |
|---|---:|
| Production build | Pass, 709 ms locally |
| JavaScript | 59 chunks, 369.1 KB total gzip |
| CSS | 1 chunk, 30.7 KB gzip |
| Largest JS chunk | Firebase vendor, 545.5 KB raw / 160.6 KB gzip |
| Cold mobile home resource transfer | 561.2 KB on local preview |
| Cold mobile home DCL / FCP | 96 ms / 140 ms locally |
| Long tasks across audited pages | 0 in the local unthrottled pass |
| Home full-page height | 10,324 px mobile / 6,719 px desktop |

The fast local paint numbers are encouraging but should not be treated as field performance. The architectural priorities are still clear: remove Firebase from anonymous-route startup, split admin CSS, and optimize the home hero image.

## Recommended implementation order

1. Correct public contact/business content and verify pricing cadence.
2. Repair the desktop home hero and reduce compact-page hero height.
3. Fix mobile target sizes and put the login form first on small screens.
4. Rework membership/event/private-training conversion states.
5. Defer Firebase/authenticated providers and split route CSS.
6. Repair ESLint coverage and the browser smoke script; then enforce the full gate in CI.
7. Run a second authenticated audit with member and instructor test accounts.

## Generated evidence

- `quality-gate-report.md` and `quality-gate-report.json`
- `browser-smoke-report.json`
- Full-page desktop and mobile screenshots in `quality/screenshots/`
