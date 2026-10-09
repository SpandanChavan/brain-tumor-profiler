# UX, Performance & Code Audit: Brain Tumor Profiler

**Date:** 2026-10-09 · **Method:** I acted as a first-time user and walked every flow on desktop (1440 px) and phone (375 px), with mouse and with keyboard. I also scripted edge cases with Playwright, measured the production bundle, and reviewed the code. Every issue below was fixed, then re-verified with automated tests.

---

## 1. Scores (brutally honest)

| Area | Before | After | Why |
|---|---|---|---|
| **First impression / visual design** | 9 | 9 | The editorial landing page is distinctive, calm and credible. Small deduction: the viewer's empty margin around the 2×2 grid on wide screens. |
| **Navigation** | **3** | **9** | Before: no URLs. Back left the site, refresh went to the landing page, and pages couldn't be linked or bookmarked. Now every page has a real URL. |
| **Analyze flow (ease of use)** | 7 | 9 | Clear three-step layout. Before: sample buttons were disabled with no reason given, the same file could be uploaded twice silently, and there was no way to cancel. |
| **Error handling** | 7 | 9 | Server errors were already friendly. Private-mode parse errors were technical, and a user mistake (same file twice) produced a confident wrong result. |
| **Workspace (viewer + results)** | 8 | 9 | Powerful and honest. Before: on mobile, 573 px of controls sat above the scan. Now the order is scan → result → controls. |
| **Mobile** | 6 | 9 | No horizontal scroll at any point. The hamburger menu was added; the workspace order is fixed. |
| **Accessibility** | 8 | 9.5 | axe WCAG 2.1 AA passes with 0 violations on all 5 pages. Added: skip link, chart role, menu focus management. |
| **Performance (landing)** | **4** | **9** | The landing page shipped 1.9 MB of JS (NiiVue, ONNX Runtime, jsPDF, DICOM converter) before the user had done anything. Now 254 KB; the heavy parts load on demand. |
| **Deploy size** | **3** | **8** | `dist` was 134 MB: 8 ONNX Runtime WASM variants were copied, 83 MB of them unused. Now 52 MB, of which 21 MB is the model and 26 MB the one WASM file actually used. |
| **Privacy UX** | 9 | 9.5 | Strong already. Now "New analysis / Delete" also releases the in-memory copies of uploaded files (object URLs). |
| **Code quality** | 8 | 9 | Typed end to end, tested, documented. Fixed: a worker leak on failed model load, a race on the API's first model load, and an unused-asset pipeline. |
| **Test coverage** | 8 | 9.5 | 51 Python + 7 unit + **18** browser tests (was 11), including regression tests for every audit finding. |
| **Overall** | **6.5 / 10** | **9.1 / 10** | |

**What still keeps it from a 10** (honest list, mostly not code):
- **The model is synthetic.** Every number in the app is a pipeline demonstration until BraTS training runs. This is the single biggest gap, and the app says so everywhere.
- **Free-tier cold start.** The first server analysis after idle can take 30–60 s. This is now cancellable and clearly explained, but it can't be removed on a free tier.
- **No real user test yet.** The SUS study (Phase 7) is still needed; this audit is expert review plus automation, not user research.
- **2×2 viewer spacing.** NiiVue's grid leaves some unused dark space at some window shapes.
- **Private mode uses the 26 MB WASM build** of ONNX Runtime. It is cached after the first use, but the first private run is a large download on slow connections.

---

## 2. Every flow tested

| # | Flow | Result |
|---|---|---|
| 1 | Landing → hero CTA, "See how it works" scroll, three task cards, privacy link, footer links | ✅ |
| 2 | Landing on a phone: hamburger opens, navigates, closes (Esc / outside tap / resize) | ✅ |
| 3 | Analyze: consent gate disables samples and upload until ticked | ✅ (now explains why) |
| 4 | Server mode, sample case → processing → workspace | ✅ ~2–4 s |
| 5 | Private mode, sample case (WebGPU and WASM fallback) | ✅ same result as server |
| 6 | Upload NIfTI pair (server) | ✅ |
| 7 | Upload zipped DICOM: server (de-identified) and private (converted on device) | ✅ |
| 8 | Upload an unreadable file (both modes) | ✅ friendly message |
| 9 | Upload mismatched T1ce/FLAIR grids (both modes) | ✅ clear message |
| 10 | Upload the **same file twice** | ❌→✅ now rejected |
| 11 | Server unreachable / asleep | ✅ message suggests waiting or Private mode |
| 12 | Cancel during processing | ❌→✅ added |
| 13 | Workspace: 5 layouts, sequence switch, 3 layers, contour/filled, opacity, colours | ✅ |
| 14 | Keyboard shortcuts O / U / E / C / L / 1–5 | ✅ |
| 15 | Area chart click → jumps to slice; "Jump to largest slice" | ✅ |
| 16 | Exports: mask NIfTI (no metadata), PNG, PDF | ✅ |
| 17 | Delete my data now / New analysis → server DELETE, blob URLs released | ✅ |
| 18 | No-tumor sample: calm, non-diagnostic wording | ✅ |
| 19 | Browser Back / Forward / refresh / deep link `/privacy`, `/model`, unknown URL | ❌→✅ |
| 20 | Keyboard-only: skip link, focus order, focus return from menu | ❌→✅ |
| 21 | Mobile workspace order and overflow | ❌→✅ |
| 22 | Accessibility audit on landing, analyze, workspace, model, privacy | ✅ 0 violations |

---

## 3. Issues found and how they were fixed

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **High** | No URL routing. Back left the app, refresh lost the page, pages couldn't be shared. | `lib/router.ts`: real URLs (`/`, `/analyze`, `/model`, `/privacy`) synced with history; per-page titles; the initial page is read from the URL (no flash); Vercel SPA rewrite. |
| 2 | **High** | 1.9 MB of JS on the landing page | `React.lazy` for the analysis screens; dynamic `import()` for jsPDF/report and the DICOM converter. Landing entry is now **254 KB**. |
| 3 | **High** | 134 MB deploy: all ONNX Runtime WASM variants copied to `public/ort` and *also* bundled | Measured which files the runtime actually requests (one pair). Stopped copying; ORT now loads Vite's single hashed, same-origin asset in dev and prod. `dist` is **52 MB**. |
| 4 | Medium | Same file accepted for both T1ce and FLAIR, giving a confident meaningless result | Rejected up front with a clear message. |
| 5 | Medium | No way to cancel a slow or sleeping-server analysis | **Cancel** button: aborts server requests (`AbortController`) or terminates the private-mode worker. Cancelling shows no error banner. |
| 6 | Medium | Mobile workspace: controls before the scan | Responsive ordering: scan → result → controls (desktop layout unchanged). |
| 7 | Medium | Disabled sample buttons gave no reason | Inline hint: "Tick the confirmation in step 1 to enable these." |
| 8 | Low | Private-mode unreadable-file error was a library message | Friendly message naming the file and the accepted formats. |
| 9 | Low | No skip link for keyboard / screen-reader users | "Skip to content" link + focusable `<main>`. |
| 10 | Low | Chart had `aria-label` without a role (axe violation) | `role="img"` with a descriptive label. |
| 11 | Low | Uploaded files stayed in memory (object URLs) after "New analysis" | URLs are revoked on new analysis / delete. |
| 12 | Low | Private-mode worker leaked if the model failed to load | Worker terminated and reset on init error. |
| 13 | Low | API: concurrent first requests could build two ONNX sessions | Double-checked lock around lazy model load. |
| 14 | Info | Accessibility tests measured mid-animation colours (false failures) | Tests wait for animations to settle. |

---

## 4. Verification after fixes

| Check | Result |
|---|---|
| Python tests (core, API, ONNX parity, privacy) | ✅ **51 passed**, ruff clean |
| Web unit tests + strict type-check | ✅ 7 passed, 0 errors |
| Browser E2E (Playwright) | ✅ **18 passed**: original 11 + 7 audit regression tests (URLs/Back/refresh, deep links, skip link, same-file, cancel, mobile order, mobile menu) |
| Accessibility (axe, WCAG 2.1 AA) | ✅ 0 violations on all 5 pages |
| Production build | ✅ landing JS 254 KB (was 1,878 KB); `dist` 52 MB (was 134 MB) |
| No horizontal scroll at 375 px | ✅ |

## 5. Recommended next steps
1. **Train on BraTS** and replace the synthetic model. This turns every "pending" into a real number.
2. **Run the SUS user test** with 5–8 people (Phase 7) and compare with this expert audit.
3. **Deploy** (HF Space + Vercel) and re-test cold-start behaviour on the real free tier.
4. Optional: let users opt into "pre-download the private-mode model" from the landing page, so the first private run feels instant.
