# Kanji Hunt — Product Guide

*v3.2.1 · April 2026*

---

## Vision

Kanji Hunt is a Japanese vocabulary capture app. You hear or encounter a word, speak it (or type it), and the app builds a rich study card with definitions, pitch accent, example sentences, furigana, and kanji breakdowns — all from a single spoken word.

The core insight: language learning happens in moments of curiosity. Kanji Hunt removes the friction between "what was that word?" and having a complete, study-ready card.

---

## Design Principles

These guide every decision. When in doubt, refer here.

1. **Pitch accuracy is sacred.** Kanjium dictionary lookup first, always. AI-generated pitch is a fallback, never trusted blindly — always sanitized (compound kana merge). Never display pitch data we aren't confident in without flagging it.

2. **No unnecessary API calls.** Romaji comes from a static lookup table (~80 entries). Mora splitting is local. Furigana is generated client-side from a kanji readings database with backtracking. Only definitions, example sentences, and TTS require network calls.

3. **Vite + React component architecture.** The app is built from `src/` using Vite. Components are in `src/components/`, shared logic in `src/lib/`, Firebase config in `src/config/`. Build output goes to `dist/`. The legacy `kanji-hunt.html` (single-file version) still exists in the repo root but is **not** the build source — do not edit it for production changes. All code changes go in `src/`.

4. **Feel native, not web.** The UI targets mobile-first, iOS-like feel. Transitions are 150ms ease. No bouncy animations. Cards have subtle shadows. The capture page is the only dark-mode surface.

5. **Capture speed matters.** The path from "I heard a word" to "card saved" should be as few taps as possible. Auto-select when confidence is high (≥70%). Only show disambiguation when alternatives genuinely compete (≥20%).

6. **Progressive disclosure.** Show the essential info first (word, reading, top definition). Details (kanji breakdown, all definitions, pitch pattern explanation) are available but not forced.

---

## Architecture Decisions

Decisions that were non-obvious and would be expensive to re-derive.

### Data flow — capture pipeline
```
Stage 1: RECORD (speech input)
  getSpeechMethod() → 'webSpeech' | 'cloudSTT' | 'manual'
  webSpeech: Chrome Web Speech API → streams interims → final result
  cloudSTT: MediaRecorder → Google Cloud STT → result
  manual: user types text
  All paths output: { transcript, alternatives, language, reading }

Stage 2: RESOLVE (language processing)
  handleRecordingResult() → shows editing UI
  handleResolvedSubmit() →
    Japanese: direct → onCapture(word)
    English: → resolveEnglishToJapanese() → picking UI or auto-select → onCapture(word)

Stage 3: LOOKUP (word data)
  fetchCoreData() → fetchPitchAndSentences() + fetchKanjiDetails()
  → normalize() → sanitize pitch, generate rubyParts, merge compound kana
  → localStorage (word store) → render
```
Adding a new input method (OCR, paste, etc.) = new Stage 1 adapter.
Adding a new language = new Stage 2 resolver.
Shared utilities: `extractReading()`, `handleRecordingResult()`, `handleResolvedSubmit()`.

### Pitch accent pipeline (`src/lib/pitch.js`)
- **Primary:** Kanjium database (embedded, from Wadoku). Gives downstep number → `downstepToPitchArray()` + `splitIntoMorae()` = 100% accurate pitch array.
- **Fallback:** AI returns `pitchAccent` array in API response. Run through `sanitizePitch()` which merges incorrectly split compound kana (し + ょ → しょ). Flagged as "AI-generated" in UI.
- **Display:** Grid-based layout. Fixed 36px columns per mora. SVG dots positioned mathematically at `col × 36 + 18`. No DOM measurement, no `getBoundingClientRect`. This was changed from a measurement-based approach that broke due to font loading timing.
- **Animation:** During TTS playback, dots pulse in sequence. Timing estimated from audio duration with weighted mora distribution (っ=0.5x, ん=0.8x, ー=1.2x, vowels=0.9x, standard=1.0x). Leading/trailing silence trimmed (~15%).

### Furigana pipeline (`src/components/FuriganaText.jsx`, `src/components/RubyDisplay.jsx`)
- `generateRubyParts(kanji, hiragana)` splits kanji string into segments, matches readings using kana as anchors.
- For consecutive kanji, `splitKanjiReading()` uses a readings dictionary (KANJIDIC-derived) with backtracking to find valid per-character splits.
- Always regenerated client-side from kanji + hiragana. Never trust API-provided ruby splits.

### Speech recognition (`src/lib/stt.js`)
- `getSpeechMethod()` — single function determines input path (no parameters — checks `firebaseAuth.currentUser`):
  - iOS → Cloud STT (MediaRecorder + `recognizeSpeech` Cloud Function)
  - Has Web Speech API (Chrome desktop) → Web Speech API (free, instant)
  - Has MediaRecorder + signed in → Cloud STT
  - Otherwise → manual text input
- Cloud STT: MediaRecorder captures audio, detects format via `isTypeSupported()`, sends to `recognizeSpeech` Cloud Function with `ENCODING_UNSPECIFIED` for Safari's MP4/AAC. **Silence detection** via AnalyserNode (fftSize 512, smoothing 0.1) auto-stops recording after 650ms of silence following 200ms+ of speech. Thresholds: speech RMS > 4, silence RMS < 2 (0-128 scale, tuned from iOS 18.7 Safari diagnostics). 5.5s hard cap as safety net. Graceful fallback to timeout-only if AnalyserNode setup fails.
- **Post-stop pipeline (v3.1.5 — v2.62 architecture, in `src/lib/stt.js`):** Audio chunks pre-converted to ArrayBuffer during recording via `ondataavailable`. On silence detection: if all speech is in already-delivered chunks (`silenceT0 <= lastChunkTime`), pipeline fires immediately from `stopRecording()` without waiting for Safari's `onstop` (~1.9s savings). Otherwise falls back to `onstop`. Auth token obtained on main thread (needs Firebase SDK), then Worker receives pre-converted buffers + token + Cloud Function URL via `postMessage`. Worker does b64 encode + fetch `recognizeSpeech` Cloud Function with Bearer auth. Main thread is free.
- Chrome Web Speech API: ~10-20% silent failure rate for single-syllable words. 250ms visual delay on capture start. Has built-in silence detection (no AnalyserNode needed).
- No browser/UA sniffing — capability detection only.

### Safari mobile capture — platform constraints (do not change without re-reading)

These are hard constraints discovered through extensive testing (v2.46–v2.62, v3.0.0–v3.1.3). They are properties of Safari's platform, not bugs to work around. Any change to the capture pipeline must account for all of them.

1. **`blob.arrayBuffer()` is inherently slow (~2s) on Safari for MediaRecorder blobs.** This is NOT main-thread contention — the same 2s stall occurs inside a Web Worker with zero React activity (proven v3.1.2). `FileReader.readAsArrayBuffer()` has the same latency. This is a Safari platform behavior.

2. **Pre-conversion during recording is the only proven mitigation.** Calling `arrayBuffer()` in `ondataavailable` gives it a ~1s head start during idle time. By `onstop`, early chunks are already converted. This works because Safari can finish the slow read when given enough time — not because moving it off the main thread helps.

3. **Short recordings (< ~1.5s of speech) were the worst case — now mitigated.** They produce only 1 chunk at `onstop` time, leaving zero idle window for pre-conversion. Previously caused a full ~2s stall. Fixed in v3.1.4: cleaning up RAF loop, AnalyserNode, AudioContext, and stream tracks *before* `recorder.stop()` frees Safari resources and drops single-chunk Package time to ~4ms. The stall was partly resource contention, not purely an inherent platform limitation.

4. **Safari ignores `timeslice` in `recorder.start(ms)`.** Setting 250ms chunks has no effect — Safari delivers chunks at ~1s intervals regardless. Cannot use smaller chunks to work around point 3.

5. **The Worker is load-bearing.** It does b64 encode + Cloud Function fetch off the main thread. Removing it (Option C, v3.0.0) causes the main thread to block during fetch, adding to the `arrayBuffer()` stall. The Worker's value is not just avoiding blob contention — it's keeping the main thread free for the entire post-stop pipeline.

6. **The v2.62 architecture is the proven configuration.** Worker URL pre-created at page load. Worker instance created at recording start. Pre-convert chunks during recording. `Promise.all` at onstop. Transfer buffers to Worker. Worker does b64 + fetch. Any restructuring of this pipeline — even "logically equivalent" changes — risks breaking the timing relationships that make it work. When migrating (e.g., auth changes), substitute values (API key → token, URL → Cloud Function), do not restructure.

### Google TTS integration
- `playGoogleTTS()` calls `synthesizeSpeech` Cloud Function with auth token. Returns an `Audio` element (does not auto-play). Caller controls playback to enable animation sync.
- SSML phoneme hint: sends kanji (for natural pitch accent) with hiragana reading (to prevent misreadings like 豊→とよ).
- If SSML fails, retries with plain text.
- Voice: `ja-JP-Neural2-B` (female) — configured server-side in Cloud Function.

### API model split (`src/lib/api.js`, `src/config/firebase.js`)
- **All API calls route through Cloud Functions** (asia-northeast1). Client sends parameters + Firebase auth token via `callCloudFunction()` in `src/lib/api.js`. Cloud Function adds API key server-side, calls Anthropic/Google, returns result. Firebase config and `getAuthToken()` are in `src/config/firebase.js`.
- **Definitions, examples, word data:** Claude (model selection handled server-side in Cloud Functions).
- Prompt engineering is critical — the prompts specify exact JSON schema, mora splitting rules, JLPT levels, definition ordering by frequency.
- **Cloud Function URLs** are public but auth-gated — every request must include a valid Firebase `idToken` in the `Authorization: Bearer` header.

### State management (`src/lib/wordStore.js`, `src/lib/storage.js`)
- All word data in localStorage via `WordStore`.
- `normalize()` runs on every word load — fixes cached data automatically when logic improves.
- Pinned words persist separately (`wordHunter_pinnedWords`).
- Capture page resets on nav tap (key-based remount).
- Reference databases (pitch, JLPT, readings) load via one-tap fetch from GitHub repo (`raw.githubusercontent.com`). Auto-detects format (JSON vs TSV). Manual paste option available as fallback.

---

## Current State

### What's implemented
- Voice capture (Japanese and English → Japanese lookup)
- iPhone voice capture via Google Cloud STT (MediaRecorder → Cloud API)
- Manual text input fallback
- Firebase Auth (Google sign-in, capture gated behind auth)
- Cloud Function API proxy (all API calls server-side, no keys in client)
- Rate limiting UI (capture badge, limit modal, Settings usage card)
- Auto-confirm for high-confidence captures (≥75% skip editing screen)
- Multi-definition display with frequency tags
- Pitch accent visualization with playback animation
- Google Neural TTS with normal, slow, and super slow (0.45x) modes
- Furigana with per-kanji ruby splitting
- JLPT level tagging (N5–N1)
- Example sentences at user's level (N+1 targeting)
- Kanji stroke order / breakdown tab
- Word history with pin/unpin
- Practice mode (placeholder)
- Voice tips carousel
- Debug logging system
- PWA manifest, service worker, app icon
- One-tap database loading from GitHub (pitch accent, JLPT, readings) — works on any device, no copy-paste needed
- Material 3 bottom nav (Capture, Learn, History, Practice, Settings) with SVG icons and yellow pill indicator
- Compact pitch accent dots on main word card (between romaji and English)

### What's known broken or incomplete
- Practice mode is a placeholder — no real quiz/SRS logic yet
- Speech recognition has inherent ~10-20% failure rate on Chrome (Web Speech API limitation)
- Cloud STT has ~1s latency + variable recording window (no streaming)
- Very long words (10+ morae) may need horizontal scroll in pitch display
- Service worker caches aggressively — users may need `?v=N` param to bust cache on updates
- Firestore security rules not yet deployed (Step 5)
- `kanji-hunt.html` (legacy single-file) is out of sync with `src/` — do not use as reference for current behavior

### Version history (major milestones)
- **v2.17** — API split (Sonnet→Haiku for definitions), A/B test framework
- **v2.19** — Multi-definition system, furigana post-processing, pin functionality
- **v2.20** — Kanji readings database, backtracking ruby splitter
- **v2.24** — Whitespace stripping, Chrome-only voice, debug logging
- **v2.25** — English capture flow, picking page, ruby anchor fix
- **v2.26** — Pitch mora sanitization, button restyling, tip trigger revision
- **v2.27** — Grid-based pitch display, nav reset, preparing state removal
- **v2.28** — Pitch playback animation, breathing buttons, TTS refactor
- **v2.29** — PWA manifest/icon/service worker, super slow TTS button, Kanji Hunt rebrand
- **v2.30–v2.34** — iPhone Cloud STT integration, `getSpeechMethod()` refactor (capability detection, no UA sniffing), 3.5s auto-stop
- **v2.35–v2.36** — One-tap database loading from GitHub repo (pitch, JLPT, readings). Export tool for moving data between devices. Format auto-detection (JSON vs raw TSV).
- **v2.37** — Material 3 bottom nav (5 tabs with SVG icons, yellow pill indicator). Settings moved to nav. API key icon moved to top-left. Compact pitch accent visualization on main word card.
- **v2.38** — M3 History page redesign (clean list, 40% kanji width, filter chips, pin stars). Consolidated Settings page (M3 grouped rows, merged Settings+Admin, API keys, database loading, data management, attribution).
- **v2.39** — Deleted AdminPage and 🔑 button (consolidated into Settings). Version number moved into Settings header. Removed default language from Settings (capture page auto-remembers last toggle via localStorage). Star icons on Learn page (replaced banner). "Starred" replaces "Pinned" in History. History furigana darkened. Star size +15%.
- **v2.40** — M3 Learn page redesign: `#fafafa` background, M3 underline tabs (replaced rounded pills), neutral pill TTS buttons, removed "Capture another" button. Nav order changed to Capture → Learn → Practice → History → Settings.
- **v2.41** — Cloud STT capture UX: tap-to-submit on mic circle, 5.5s recording window, "Tap circle when done" hint for Safari/iOS, recording text fades 2-5s while hint brightens. Web Speech API path unchanged.
- **v2.42** — Fixed Cloud STT tap-to-submit (stopFn timing bug — was null when onClick fired due to async getUserMedia). Learn page top alignment fixed (flex-start instead of center). Example cards now white (#fff) for contrast against #fafafa background.
- **v2.43** — Capture pipeline refactor. Extracted shared `handleRecordingResult()` (both speech methods feed same shape), `handleResolvedSubmit()` (both languages use same submit path), and `extractReading()` (shared kana detection). Speech input method (webSpeech/cloudSTT) and language flow (ja/en) are now orthogonal concerns. Adding new input methods or languages requires only a new Stage 1 adapter or Stage 2 resolver.
- **v2.44** — M3 capture page UI redesign (all 6 states). Removed black borders, box-shadows, and heavy styling. Semi-transparent inputs (`rgba(255,255,255,0.08)`), borderless yellow pill buttons, consistent `#1a1a2e` background across all states. Editing: furigana/definition centered on input pill, Go button height-matched, dynamic font sizing for long words. Listening: type-instead fixed at `bottom: 80px` (no overlap with mic). Error: added X icon circle. Picking: lighter card borders. Manual: matching M3 input style. Removed dead `TryAgainBtn` component (inlined). v2.44.1: fixed serif font on success screen.
- **v2.45** — Fixed desktop nav shift (scrollbar toggling changed viewport width — added `html { overflow-y: scroll }`). Type-instead button moved back to flow with `marginTop: 20px` (was absolute-positioned below fold on mobile). Fixed mobile type-instead showing error: Cloud STT catch handler now checks `gotFinalRef` to skip error when user intentionally cancelled via type-instead.
- **v2.46** — Silence detection for Cloud STT. AnalyserNode monitors audio RMS during recording. Auto-stops after 800ms silence following 400ms+ speech (thresholds: speech > 4, silence < 2, smoothing 0.1 — tuned from Safari iOS 18.7 diagnostics). 5.5s hard cap retained as safety net. AnalyserNode gracefully degrades to timeout-only if setup fails. Listening UI unified: both speech methods now show "Say a word in Japanese/English" (removed Cloud STT-specific "Tap circle when done" hint and 2-5s fade animation). Tap-to-submit retained as undocumented backup.
- **v2.47** — Volume bar for Cloud STT: live RMS meter (160×4px) below hint text, turns yellow during speech. Generation counter (`captureGenRef`) prevents stale Cloud STT results from overwriting new recordings — fixes bug where rapid Try Again / lang switch caused ghost results and false errors from overlapping async promise chains.
- **v2.50** — MIN_SPEECH_MS lowered to 200ms. Various b64 encoding attempts (v2.50.1 arrayBuffer+btoa, v2.50.2 in-app benchmark showing all methods fast in isolation at 3-7ms).
- **v2.51** — Web Worker for b64 only. Still slow (1800ms) due to main thread blocking before Worker receives data.
- **v2.52** — Entire post-stop pipeline moved to Web Worker: blob.arrayBuffer → b64 encode → Google STT fetch → parse result. Revealed blob.arrayBuffer() was the bottleneck at 2.6s on main thread, while Worker internals took only 909ms.
- **v2.53** — Moved blob.arrayBuffer to Worker too (send Blob directly). Still slow — arrayBuffer() inconsistently slow even inside Worker (0-2000ms).
- **v2.54** — Send raw chunks as Blobs to Worker. arrayBuffer still slow inside Worker sometimes.
- **v2.55** — Pre-convert chunks to ArrayBuffer during recording via ondataavailable (while main thread is idle between frames). By onstop, data already converted. Pipeline dropped to ~1.3s. Remaining gap was ~400ms Worker creation overhead.
- **v2.56** — Pre-create STT Worker singleton at app startup. **Reverted in v2.57** — pre-created Workers on iOS Safari enter a low-power/suspended state, causing 2-3s wake-up latency on postMessage. Fresh per-capture Workers are faster.
- **v2.57** — Reverted to fresh Worker per capture (v2.55 approach). Worker code extracted to shared `sttWorkerCode` string to avoid duplication. Worker created, used, and terminated per capture.
- **v2.58-59** — Attempted streaming chunks to Worker during recording. Reverted to v2.55 architecture (pre-convert chunks during recording, fresh Worker on stop).
- **v2.60** — Code cleanup. Removed B64 benchmark from Settings. Removed redundant timing logs. v2.60.1: added confidence score display (30px, color-coded) above input pill on editing screen, passed through pipeline from both Cloud STT and Web Speech API.
- **v2.62** — Pre-create Worker URL at page load, create Worker when recording starts. Eliminated ~440ms Worker creation overhead at onstop. Post overhead now 3-16ms vs 440ms before. Pipeline overhead near zero — total pipeline time ≈ Google API time.
- **v2.63** — Auto-confirm: captures with confidence >= 75% skip the editing screen and go straight to word lookup. Saves 1-2s of user confirmation time for high-confidence results. Low-confidence results still show the editing screen for review.
- **v2.64** — Fixed "Type instead" bug: tapping Type Instead during Cloud STT recording triggered "No speech detected" because `recorder.onstop` still ran the full API pipeline after cancellation. Added `cancelled` flag + `ctrl.cancel()` to short-circuit `onstop` before sending audio to Google. Silence detection threshold reduced from 800ms to 650ms. Added capture summary log (📊) showing 4-phase timing breakdown: Capture → Package → API → Display.
- **v3.0.0** — **Firebase Auth + Cloud Function migration (Phase 3, Step 3).** All API calls (Claude, Google STT, Google TTS) now route through Cloud Functions with Firebase Auth tokens — no API keys in client code. Removed `getStoredAPIKey`, `getStoredGoogleTTSKey`, `ANTHROPIC_HEADERS`, `callAnthropic`, and all localStorage key storage. Removed STT Web Worker entirely (Option C architecture: pre-converted buffers → b64 encode + Cloud Function fetch on main thread — latency-neutral since `arrayBuffer()` pre-conversion during recording already solved the main-thread contention). Added Firebase SDK (firebase-app-compat, firebase-auth-compat via CDN). Added Google sign-in with popup (redirect fallback for mobile). Capture page gated behind auth. Settings page: API key inputs replaced with Account section (sign-in/out, user email display). `getSpeechMethod()` no longer takes a key param — checks `firebaseAuth.currentUser` instead. All fetch functions (`fetchCoreData`, `fetchPitchAndSentences`, `fetchKanjiDetails`, `resolveEnglishToJapanese`, `playGoogleTTS`) call Cloud Function URLs via `callCloudFunction()` helper with Bearer token auth. `WordStore.fetchOrCreateWord` checks auth state instead of apiKey. ViewPage error states reference auth instead of API keys. `HearTab` and `WordCard` no longer receive `googleTTSKey` prop.
- **v3.0.1** — **Restored STT Worker for mobile Safari latency.** Option C (main-thread b64+fetch) caused ~1.8s Package time on mobile Safari. Restored Worker architecture.
- **v3.1.0** — **Rate limit UI (Phase 3, Step 4).** Top-right badge on capture page shows remaining captures (e.g. "27"). Badge turns red at 0. When limit reached: modal overlay dims capture area with centered dialog showing icon, "Limit reached" title, reset date, "Get more captures" CTA (placeholder), and dismiss button. Settings page: new "Usage" section between Account and Databases with progress ring, "73 / 100" count, progress bar (yellow→red at limit), and reset date. Usage fetched from `getUsage` Cloud Function on sign-in and after each successful capture.
- **v3.1.1–v3.1.2** — STT pipeline experiments (250ms chunks, FileReader, Worker-side blob read). All failed — see "Retro: STT Pipeline During Firebase Migration" section. Key finding: Safari's `blob.arrayBuffer()` is inherently slow (~2s), not a main-thread contention issue.
- **v3.1.3** — **Exact v2.62 STT architecture restored.** Copied line-for-line, only substituting auth token + Cloud Function URL for Google API key. Confirmed performing at v2.62 baseline (~10ms Package time on multi-chunk captures). Diagnostic chunk logging still in place (temporary).
- **v3.1.4** — **Early cleanup before recorder.stop().** Moved RAF cancel, AnalyserNode disconnect, stream track stop, and AudioContext close from `onstop` to `stopRecording()` — i.e., before `recorder.stop()` is called. Result: Package time on late single chunks dropped from ~427ms to 4ms. Confirms that Safari `arrayBuffer()` stall on short recordings is partly resource contention, not purely an inherent platform limitation. The v3.1.2 Worker test (2221ms inside Worker) had all these processes still running — the Worker test disproved *main-thread* contention, not contention overall.
- **v3.1.5** — **Early pipeline fire.** Bypass Safari's stop→onstop gap (~1.9s) by firing STT pipeline from `stopRecording()` when silence was detected before the last chunk arrived (`silenceT0 <= lastChunkTime`). Safety check prevents audio clipping on longer phrases — falls back to `onstop` when speech may span chunk boundaries. Also: **Vite migration recognized in CLAUDE.md** — updated architecture docs, file locations, and design principles to reflect `src/` structure (legacy `kanji-hunt.html` no longer the build source).

---

## Retro: Cloud STT Latency Investigation (v2.46–v2.56)

### Problem
Cloud STT capture on mobile Safari took ~10 seconds end-to-end vs ~3 seconds on the v3 standalone test page. Same device, same APIs, same audio.

### What we tried (in order)
1. **AnalyserNode silence detection** (v2.46) — worked on Chrome, failed on Safari. Turned out to be a code bug (thresholds too high), not a Safari limitation.
2. **Safari audio diagnostics page** (standalone) — systematically tested AnalyserNode, ScriptProcessor, AudioWorklet, chunk decode. All worked. Proved AnalyserNode was viable.
3. **v3 test page** — built standalone silence detection test with correct thresholds. Worked perfectly on Safari.
4. **Ported to production** (v2.47-48) — rewrote for "React patterns" instead of copying v3 architecture. Broke silence detection timing. Had to learn: copy what works, don't rewrite.
5. **Direct v3 port** (v2.49) — copied v3 architecture literally. Silence detection worked but post-stop pipeline took 5+ seconds.
6. **Incremental b64 optimization** (v2.50-51) — tried different encoding methods. In-app benchmark showed all methods fast (3-7ms) in isolation. Problem wasn't encoding speed.
7. **Web Worker for full pipeline** (v2.52-54) — moved b64+fetch to Worker. Revealed the real bottleneck: `blob.arrayBuffer()` taking 1.7-2.6 seconds on main thread due to React event loop congestion. Even inside Worker, Blob operations were inconsistently slow.
8. **Pre-convert during recording** (v2.55) — convert each chunk's arrayBuffer during ondataavailable (while main thread is idle between animation frames). By onstop, data already ready. This was the breakthrough.
9. **Pre-create Worker** (v2.56) — eliminated ~400ms Worker creation overhead per capture.

### Root cause
Safari's `Blob.arrayBuffer()` is inherently slow (~2s) for MediaRecorder blobs, regardless of thread. This is NOT primarily a main-thread contention issue as originally theorized — v3.1.2 proved the same 2s stall occurs inside a Web Worker with zero React contention (`ab=2221ms` in Worker). The pre-conversion approach (v2.55) works not because it avoids contention, but because it gives `arrayBuffer()` a ~1 second head start during recording idle time. When chunks arrive early enough, even Safari's slow implementation finishes before `onstop`.

The variability comes from short recordings that produce only 1 chunk at `onstop` time — there's no idle window to pre-convert, so the full ~2s stall hits.

### Key learnings
1. **Diagnostic-first, not trial-and-error.** The Safari audio diagnostics page (testing all 5 methods in one shot) gave definitive answers in one test cycle. Should have done the same for the latency issue instead of 6 incremental guesses.
2. **Test in production context.** The in-app b64 benchmark proved encoding was fast in isolation — the problem was contention, not computation. Benchmarks must run under real conditions.
3. **Copy what works.** The v3 test page worked. Rewriting it for "React style" broke it. When a test proves something, replicate the architecture — only deviate where literally forced to.
4. **Pre-compute during idle time.** The winning insight: convert chunks to ArrayBuffer during recording (when the main thread is idle between RAF frames), not after recording stops (when React is re-rendering).
5. **Respect the user's time.** Incremental "maybe this will work" changes that each require a deploy+test cycle are expensive. Plan holistically, test definitively, ship confidently.

### Final architecture
```
During recording:
  RAF loop: AnalyserNode → RMS → silence detection + volume bar (direct DOM)
  ondataavailable: chunk.arrayBuffer() → pre-converted buffer (async, during idle time)

On silence detected / hard cap:
  recorder.stop() → onstop:
    1. Poll for pre-converted buffers (usually 0ms wait)
    2. Transfer ArrayBuffers to pre-created Worker (zero-copy)
    3. Worker: merge → b64 → fetch Cloud Function (with auth token) → return result
    4. Main thread receives transcript, updates React state
```

---

## Retro: STT Pipeline During Firebase Migration (v3.0.0–v3.1.3)

### Problem
During the Firebase auth migration, the STT Worker needed to change from calling Google STT directly (with an embedded API key) to calling a Cloud Function (with a Firebase auth token). The question was how to restructure the pipeline.

### What we tried (in order)
1. **Option C: Remove Worker entirely** (v3.0.0) — b64 + fetch on main thread. Assumption: pre-conversion solved the bottleneck, Worker no longer needed. Result: ~1.8s Package time on mobile Safari. Failed.
2. **Restore Worker, pass auth token** (v3.0.1) — exact v2.62 architecture with token instead of API key. Result: inconsistent — fast when chunks pre-converted, 2s stall on short recordings (1 chunk).
3. **250ms chunk interval** (v3.1.1) — reduce chunk size to speed up `arrayBuffer()`. Result: Safari ignores `timeslice` parameter in `recorder.start()`. Chunks still arrive at ~1s intervals. Dead end.
4. **FileReader instead of blob.arrayBuffer()** (v3.1.1) — different API, same concept. Result: same 2s stall. Ruled out API-specific bug.
5. **Send raw Blobs to Worker** (v3.1.2) — let Worker call `arrayBuffer()` off main thread. Result: `ab=2221ms` *inside Worker*. Same stall with zero React contention. Disproved the main-thread contention theory.
6. **Copy v2.62 exactly** (v3.1.3) — stopped experimenting, copied the proven architecture line-for-line, only substituting auth token + Cloud Function URL.

### Key findings
- **Safari's `blob.arrayBuffer()` is inherently slow (~2s) for MediaRecorder blobs.** Not a main-thread issue — same latency in a Worker. This corrects the v2.52 retro conclusion.
- **Pre-conversion works by giving `arrayBuffer()` a head start,** not by avoiding contention. Early chunks get ~1s of idle time to convert; by `onstop`, they're ready.
- **Short recordings are the worst case.** With only 1 chunk arriving at `onstop` time, there's no idle window for pre-conversion. This is an inherent limitation of Safari's MediaRecorder + blob implementation.
- **Safari ignores `timeslice` in `recorder.start()`.** The 250ms interval hint is not honored — chunks arrive at ~1s intervals regardless.
- **`FileReader.readAsArrayBuffer()` has the same latency as `blob.arrayBuffer()`.** Both use the same underlying Safari blob-reading path.

### Architectural learnings
1. **Proven architectures are not fungible.** "Same logic, different structure" is not the same thing. The v2.55 pipeline worked because of specific timing relationships between chunk arrival, idle time, and `onstop`. Restructuring broke those relationships even when the "logic" was equivalent.
2. **When migrating proven systems, change the minimum.** The correct v3.0 migration was: copy v2.62 line-for-line, swap `googleKey` for `authToken`, swap Google URL for Cloud Function URL. Three substitutions, zero restructuring. Everything else was unnecessary risk.
3. **"Should work in theory" is not evidence.** Multiple approaches (no Worker, FileReader, Worker-side blob read, smaller chunks) were reasonable hypotheses that all failed. The only reliable signal was "this exact code worked before."
4. **Safari's blob stall is partly resource contention, not a pure platform constraint.** The v3.1.2 Worker test (2221ms inside Worker) disproved *main-thread React* contention — but RAF loop, AnalyserNode, AudioContext, and stream tracks were still running. v3.1.4 proved those matter: tearing them down before `recorder.stop()` dropped single-chunk Package time from ~427ms to ~4ms. `timeslice` being ignored is still a true platform constraint.
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Kanji font | `Noto Serif JP` | Extensive testing across serif/sans options. Best balance of readability, stroke clarity, and aesthetic at large display sizes. **Only used on Learn page word card, History page kanji, and Picking page kanji display.** Capture page uses system font throughout. Do not change without explicit revisit. |
| Pitch accent visualization | Custom SVG grid (36px columns, pure math positioning) | No DOM measurement, no render-measure-rerender. Keep implementation exactly as-is — fragile to change. |
| Definition display tags | `common` / `uncommon` / `rare` frequency labels | Deliberate taxonomy after iterating on alternatives. Keep existing display logic unless specifically revisiting. |
| JLPT badge colors | N5 green → N4 lime → N3 amber → N2 pink → N1 red | Consistent across Learn and History pages. Do not change without updating both. |

### Tests completed
- **iPhone STT standalone test** — Standalone test page (stt-test.html) deployed to GitHub Pages. Tested ~12 Japanese words on iPhone 16 / Safari. Accuracy on par with Chrome desktop Web Speech API. MediaRecorder selected `audio/webm;codecs=opus` format. `ENCODING_UNSPECIFIED` worked for Google Cloud STT V1.
- **iPhone full app test** — Kanji Hunt deployed to GitHub Pages (ushiroda80.github.io/KanjiHunt). Voice capture, TTS playback, word cards confirmed working on iPhone 16 / Safari.
- **Usage notes prompt iteration** — Tested multiple prompt versions for usage notes (replacing definitions with practical usage differences). Compared Haiku vs Sonnet output. Current prompt ready for further testing.

---

## Beta Launch Roadmap

### Phase 1: Make it installable ✅
**1. PWA wrapper** — done

*Goal: All users. The app feels like a real app, not a browser tab. Users can launch from homescreen with custom icon and fullscreen experience.*

- manifest.json with app name, icon (pitch-dot icon #15), theme color
- Service worker for basic caching
- "Add to homescreen" works on iOS and Android
- App launches fullscreen, no browser chrome

### Phase 2: Make it work on iPhone ✅
**2. Google Cloud STT** — done

*Goal: iPhone / mobile web users. Unlocks the core capture feature for the ~55% of users who are on iOS. Without this, iPhone users cannot speak words into the app at all. Adds ~1s latency vs desktop Chrome, but functionally equivalent. Bridge solution until native iOS app uses Apple's free on-device SFSpeechRecognizer/SpeechAnalyzer.*

- `getSpeechMethod()` — single capability-detection function, no UA sniffing
- MediaRecorder captures audio, auto-detects format via `isTypeSupported()`
- Safari MP4/AAC → `ENCODING_UNSPECIFIED` for Google Cloud STT V1 (auto-detect)
- 3.5s auto-stop for single word capture
- Tested on iPhone 16 / Safari — accuracy matches Chrome desktop
- Deployed and live on GitHub Pages

### Phase 3: Backend + auth (Firebase)
**3. Firebase setup** — ~3-4 sessions

*Goal: All users. Removes the need for users to manage their own API keys (biggest onboarding friction today). Enables personal accounts, cross-device sync, and unlocks Phases 4 and 5. Without this, every user's data is trapped in one browser on one device.*

**Architecture decisions (locked):**
- **Firebase Blaze plan** (pay-as-you-go). Unlocks Cloud Functions. Free tier still applies — at current scale, cost is $0-2/month. Budget alerts set up to catch spikes.
- **Client SDK: firebase-auth.js only** (via npm/Vite). No Firestore SDK on client. All data reads/writes go through Cloud Functions. Keeps the client lightweight.
- **No localStorage migration.** Clean slate — existing localStorage word data stays as-is for reference but is not imported to Firestore.
- **Server outage: generic error page.** If Cloud Functions are unreachable, show a simple "temporarily unavailable" screen. No fallback to localStorage-only mode.
- **Three separate Claude Cloud Functions** (Option B). Called in parallel from client, matching current progressive-fill UX where the word card fills in as each response arrives.

#### Step 1: Firebase project setup (~30 min)
- Create Firebase project in console (e.g. `kanji-hunt`)
- Enable **Authentication** → Google sign-in provider
- Enable **Firestore** (start in test mode, lock down in Step 5)
- Enable **Cloud Functions** (requires Blaze plan)
- Record project config (apiKey, authDomain, projectId) — these are public, safe to embed in client HTML
- Set budget alerts in Google Cloud Console

#### Step 2: Cloud Functions — API proxy (~1-2 sessions)

Five Cloud Functions. All verify Firebase auth token before processing. API keys stored as Cloud Functions environment config (never in client code).

| Function | Proxies | Client sends | Server-side key |
|----------|---------|-------------|-----------------|
| `fetchCoreData` | `callAnthropic` (core word data) | word, sourceContext | `ANTHROPIC_API_KEY` |
| `fetchPitchAndSentences` | `callAnthropic` (pitch + examples) | word, skipPitch, jlpt, definitions | `ANTHROPIC_API_KEY` |
| `fetchKanjiDetails` | `callAnthropic` (kanji breakdown) | word | `ANTHROPIC_API_KEY` |
| `resolveEnglish` | `resolveEnglishToJapanese` | englishWord | `ANTHROPIC_API_KEY` |
| `recognizeSpeech` | Google Cloud STT | audioBase64, lang, mimeType | `GOOGLE_STT_KEY` |
| `synthesizeSpeech` | Google TTS | text, hiraganaHint, speed | `GOOGLE_TTS_KEY` |

Each function:
1. Verify Firebase auth token (reject if invalid/missing)
2. Check rate limit for capture functions (Step 4)
3. Call the real API with server-side key
4. Return result to client

**STT migration note:** The Web Worker currently calls Google STT directly with the API key embedded. Post-migration, the Worker sends audio to the `recognizeSpeech` Cloud Function instead. Adds one network hop (~100-200ms) but eliminates catastrophic cost risk from key exposure.

**Testing:** Each function can be tested independently with `curl` + a valid auth token before touching client code.

**Deployed URLs (asia-northeast1):**
```
fetchCoreData:        https://fetchcoredata-paobljo2bq-an.a.run.app
fetchPitchAndSentences: https://fetchpitchandsentences-paobljo2bq-an.a.run.app
fetchKanjiDetails:    https://fetchkanjidetails-paobljo2bq-an.a.run.app
resolveEnglish:       https://resolveenglish-paobljo2bq-an.a.run.app
recognizeSpeech:      https://recognizespeech-paobljo2bq-an.a.run.app
synthesizeSpeech:     https://synthesizespeech-paobljo2bq-an.a.run.app
getUsage:             https://getusage-paobljo2bq-an.a.run.app
getWords:             https://asia-northeast1-kanji-hunt.cloudfunctions.net/getWords
saveWord:             https://asia-northeast1-kanji-hunt.cloudfunctions.net/saveWord
updateWordField:      https://asia-northeast1-kanji-hunt.cloudfunctions.net/updateWordField
deleteWords:          https://asia-northeast1-kanji-hunt.cloudfunctions.net/deleteWords
```

**Firebase project config (public, embedded in client HTML):**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAONlO5vAGAZb3zux6iQGORuksnqsJ7PKc",
  authDomain: "kanji-hunt.firebaseapp.com",
  projectId: "kanji-hunt",
  storageBucket: "kanji-hunt.firebasestorage.app",
  messagingSenderId: "443591225699",
  appId: "1:443591225699:web:91ec7ef21a6f33c6506356"
};
```

**Secrets stored via `firebase functions:secrets:set`:**
- `ANTHROPIC_API_KEY` — Anthropic API key (for Claude calls)
- `GOOGLE_STT_KEY` — Google Cloud Speech-to-Text key
- `GOOGLE_TTS_KEY` — Google Cloud Text-to-Speech key

**Local dev files (on Mac):**
- Firebase project root: `/Users/JKO/`
- Cloud Functions code: `/Users/JKO/functions/index.js`
- Firebase config: `/Users/JKO/firebase.json`
- Deploy command: `cd /Users/JKO && firebase deploy --only functions`

**Working process — IMPORTANT:**
- Tadashi is the PM, not an engineer. Never ask him to make code changes manually. Always make code changes directly.
- For Cloud Functions: provide the full `index.js` file, ready to drop into `/Users/JKO/functions/`. Tadashi deploys via `firebase deploy --only functions`.
- For client code: **edit files in `src/`** (not `kanji-hunt.html`). The app is built with Vite from `src/`. Use the `/deploy` skill — it handles version bump, `npm run build`, commit, and push automatically.

#### Step 3: Client-side auth + API migration ✅ DONE (v3.0.0)

**What was done:**
- Added Firebase SDK (`firebase-app-compat.js`, `firebase-auth-compat.js`) via CDN `<script>` tags
- Firebase app initialized with project config in plain JS block (before Babel)
- Google sign-in via `signInWithPopup` with `signInWithRedirect` fallback for mobile
- Auth state tracked via `firebaseAuth.onAuthStateChanged` → React state (`firebaseUser`)
- Capture page gated behind auth — shows sign-in button when not authenticated
- `callCloudFunction(functionName, params)` helper — adds `Authorization: Bearer {idToken}` header
- All API calls migrated: `fetchCoreData`, `fetchPitchAndSentences`, `fetchKanjiDetails`, `resolveEnglishToJapanese`, `playGoogleTTS` → Cloud Function URLs
- **STT Worker removed entirely (Option C).** Post-stop pipeline now runs on main thread: pre-converted ArrayBuffers → `encodeBuffersToBase64()` → fetch `recognizeSpeech` Cloud Function. Latency-neutral because pre-conversion during recording (v2.55) already solved the main-thread contention. Simpler architecture, no token-passing complexity.
- `getSpeechMethod()` takes no parameters — checks `firebaseAuth.currentUser` instead of Google API key
- Settings page: API key inputs replaced with Account section (sign-in/out, user display name + email)
- Removed: `getStoredAPIKey`, `setStoredAPIKey`, `getStoredGoogleTTSKey`, `setStoredGoogleTTSKey`, `ANTHROPIC_HEADERS`, `callAnthropic`, `sttWorkerCode`, `sttWorkerUrl`, Worker creation/management
- Removed: `apiKey` and `googleTTSKey` props from `CapturePage`, `ViewPage`, `WordCard`, `HearTab`
- ViewPage error states reference auth instead of API keys

**What stayed the same:**
- All UI, capture flow, word card rendering, localStorage reference databases
- Silence detection, volume bar, capture summary log
- Functions return the same data shapes — only the transport changed

#### Step 4: Rate limiting (built into Step 2)

**Schema:**
```
users/{uid}/usage: { capturesThisMonth: 73, monthKey: "2026-03" }
```

**Logic (inside capture Cloud Functions):**
- Read user's usage doc
- If `monthKey` !== current month → reset to 0
- If `capturesThisMonth` >= 100 → reject with `rate-limited` error + reset date
- Otherwise → increment and proceed

**Client-side:**
- Show "73 / 100 this month" in Settings or subtle capture page indicator
- When limit hit, disable capture button with clear message and reset date
- TTS plays are unlimited (Phase 4 cache makes these nearly free)

#### Step 5: Firestore security rules (~30 min)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /cache/{document=**} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions (admin SDK bypasses rules)
    }
  }
}
```

#### Step 6: Admin tooling (~30 min)

- Admin Cloud Functions: `resetUsage`, `getStats`, `wipeDictionaryCache`
- In-app admin panel in Settings — visible only when signed in as developer email
- Firebase Console covers everything else

#### Step 7: Cost protection (~30 min)

- Set per-API quotas in Google Cloud Console → APIs & Services → Quotas for Google STT, TTS, and Cloud Functions (e.g. 1,000 requests/day hard cap per API)
- Budget alert already set at ¥1,000/month with notifications at 50%, 90%, 100%
- Note: Firebase budget alerts are notifications only — they do NOT cap spending. API quotas are the actual hard stop against runaway bugs or misconfigs.
- Optional: programmatic billing disable Cloud Function that kills billing when budget threshold is exceeded (nuclear option — takes app offline)

#### Implementation sequence
```
Step 1 (Firebase setup) → ✅ DONE — project created, Blaze plan, Auth + Firestore enabled
Step 2 (Cloud Functions) → ✅ DONE — 7 functions deployed to asia-northeast1, invoker: "public"
Step 3 (Client auth + migration) → ✅ DONE — v3.0.0: Firebase Auth + Cloud Function proxy, v3.1.3: STT pipeline stable
Step 4 (Rate limiting) → ✅ DONE — backend in Step 2, UI in v3.1.0 (badge + Settings card + modal)
Step 5 (Security rules) → 🔒 DO BEFORE BETA — Firestore rules, ~30 min
Step 6 (Admin) → TODO — admin Cloud Functions + in-app panel, lower priority
Step 7 (Cost protection) → 🔒 DO BEFORE BETA — per-API quotas in Google Cloud Console, ~30 min
```

#### Security checklist (do before inviting any users)

These two items are the only meaningful security gaps at current scale. Both are ~30 minutes and one-time.

| Task | Risk if skipped | Effort |
|------|----------------|--------|
| **Step 5: Firestore rules** | Any authenticated user could read/write any other user's data if Firestore is in test mode | 30 min, one-time |
| **Step 7: API quotas** | A bug or bad actor could run up unlimited Google API charges (budget alerts notify but don't cap) | 30 min, one-time |

**Already handled:**
- ✅ Firebase auth tokens on every Cloud Function request (Step 2)
- ✅ Rate limiting per user (Step 4)
- ✅ Service account key excluded from git via `.gitignore` (v3.2.0)
- ✅ Dependabot alerts enabled on GitHub for dependency vulnerabilities
- ✅ No API keys in client code (all server-side in Cloud Functions)

### Phase 4: Per-user word lists
**4. Personal word lists** — ~2 sessions

*Goal: All logged-in users. Each person has their own vocabulary collection that syncs across devices. Your phone and laptop show the same captured words, pins, and history. Foundation for future SRS/review features.*

- Each user has their own captured words tied to their Firebase account
- Pin/unpin, history, all per-user
- Syncs across devices (phone + laptop see same words)
- Builds on Firebase auth from Phase 3
- Pinned state merged into word documents (eliminates separate pinnedWords localStorage)

### Phase 5: Smart caching
**5a. TTS audio cache** — ~1 session

*Goal: All users, cost reduction. Eliminates ~70-80% of API spend. The same word sounds identical every time — no reason to call Google TTS twice for 猫. Users also get faster playback on repeat listens (instant from cache vs ~300ms API round trip).*

- First play of any word+speed → Google TTS API call → store base64 MP3 in Firestore
- Every subsequent play by any user → serve from cache, zero API cost

**5b. Dictionary cache** — ~1-2 sessions

*Goal: All users, cost reduction + speed. Common words (猫, 東京, 食べる) become instant lookups after the first person captures them. Builds a growing, verified dictionary over time. At 60-70% cache hit rate, cuts Claude API costs by more than half.*

- First time any user captures a word → Claude API call → save full word data to Firestore
- Second time anyone captures the same word → serve cached response, no API call
- Kanjium pitch data always overrides AI pitch in cached entries
- Schema: `{ kanji, hiragana, definitions, pitchAccent, pitchSource, examples, jlptLevel, rubyParts, lookupCount, createdAt }`

### Phase 6: Security hardening
**6a. Firestore security rules** — ~30 min (Phase 3, Step 5)
**6b. API quotas** — ~30 min (Phase 3, Step 7)

### Data architecture (Firebase)

```
users/
  {uid}/
    settings: { defaultLang, tipsEnabled }
    words/
      {wordId}: { kanji, hiragana, capturedAt, pinned, ... }

cache/
  dictionary/
    {kanji}: { definitions, pitchAccent, examples, ... }
  tts/
    {kanji}_normal: { base64, duration }
    {kanji}_slow: { base64, duration }
```

### Cost projection (post-cache, 50 beta users)
- Mixed usage: ~$15-40/month total
- Firebase free tier covers auth + Firestore for this scale
- Main cost is Claude API + Google TTS for cache misses (new words only)

---

## Product Research Backlog (higher priority, pre-feature)

### Natural translation selection (English → Japanese)

*Problem: When capturing from English, the app may return a literal word-for-word translation that exists but isn't how Japanese speakers naturally express the concept. E.g. "business competitor" → 事業競争者 (literal, rarely used) vs 競合他社 or ライバル (natural).*

*Goal: Default-select the most natural equivalent. Show alternatives (including literal if it's a real word) with visual cues that help the user understand the difference — without confusing them.*

**Status: Needs product research before implementation.**

**Research plan:**
- Build a test set of ~15 tricky English→Japanese translations (idioms, business terms, compound nouns, colloquial phrases) and run them through current capture flow
- Evaluate what dimensions of differentiation actually help users. Initial candidates:
  - Natural vs literal — but many words are both, so labeling could confuse. Need to find the right framing.
  - Frequency of use — valuable but may belong on the Learn page rather than the capture/picking page. Explore where this info is most useful.
  - Context tags (business, casual, written, spoken) — may be more intuitive than natural/literal
  - Era/currency ("common", "declining since ~2000s", "archaic")
- Determine which dimensions are prompt-solvable (Claude already knows this) vs which need external data
- The implementation is likely a prompt engineering change + picking page UI adjustment — not a new system

**Open questions:**
- What label scheme is clear to a learner without being overwhelming?
- Should frequency/usage data live on the picking page or the learn page or both?
- How do we handle words that are simultaneously literal and natural (no differentiation needed)?

---

## STT Latency Research Backlog

- **Raw PCM (LINEAR16) vs WebM to Google STT** — Test whether sending raw PCM audio affects Google API response times vs current WebM/Opus. Would require AudioWorklet to capture raw samples (bypasses MediaRecorder entirely — no blobs, no arrayBuffer). Also eliminates Safari's slow blob unwrapping problem at the source. Research note: no published benchmarks found comparing format → API latency; Google docs say format affects accuracy/bandwidth, not response speed. Worth testing empirically with our own capture logs since the `api=` timing in our pipeline log isolates Google round-trip exactly.

---

## Future Ideas (post-beta, lower priority)

- **Native iOS app** — Apple's on-device SFSpeechRecognizer (today) or SpeechAnalyzer (iOS 26) supports Japanese, is free, zero latency, no network required. Eliminates the Cloud STT cost and latency entirely. Go native when feature set stabilizes.
- **Alternative word differentiation** — When showing alternate captures (e.g. 聞く vs 聴く), indicate the relative difference between words. Could be tags like (formal), (academic), (casual), (written), frequency rank, or a short gloss. Approach TBD. Lower priority.
- SRS / spaced repetition for practice mode
- Audio-only review (play word, recall before flip)
- Shared/group word lists (classroom, study groups)
- Anki deck export
- Word frequency ranking
- Sentence mining (capture sentences, extract words)
- Offline capture with background sync
- Monetization (subscription model, usage tiers)

---

## NPM Packages

### Dependencies (shipped to users)
| Package | Version |
|---------|---------|
| `firebase` | ^10.12.0 |
| `react` | ^18.3.1 |
| `react-dom` | ^18.3.1 |

### Dev dependencies (build tools only)
| Package | Version |
|---------|---------|
| `vite` | ^5.4.0 |
| `@vitejs/plugin-react` | ^4.3.1 |
| `@vitejs/plugin-basic-ssl` | ^1.2.0 |

---

## Files

### Source (Vite + React — this is what gets built and deployed)

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component, auth state, nav, routing |
| `src/main.jsx` | Vite entry point |
| `src/config/firebase.js` | Firebase init, auth, Cloud Function URLs, `getAuthToken()` |
| `src/lib/stt.js` | Cloud STT: `recognizeWithCloudSTT()`, `getSpeechMethod()`, silence detection, Worker pipeline |
| `src/lib/api.js` | `callCloudFunction()`, `fetchCoreData()`, `fetchPitchAndSentences()`, `fetchKanjiDetails()`, `resolveEnglishToJapanese()`, `playGoogleTTS()` |
| `src/lib/pitch.js` | Pitch accent logic: `splitIntoMorae()`, `downstepToPitchArray()`, `sanitizePitch()` |
| `src/lib/wordStore.js` | `WordStore` — localStorage word data CRUD |
| `src/lib/storage.js` | localStorage helpers (lang pref, tips, etc.) |
| `src/lib/databases.js` | Reference DB loading (pitch, JLPT, readings) from GitHub |
| `src/components/pages/CapturePage.jsx` | Capture UI: mic, silence viz, editing, picking, debug log |
| `src/components/pages/ViewPage.jsx` | Learn page: word card, tabs, TTS |
| `src/components/pages/HistoryPage.jsx` | Word history list, stars, filters |
| `src/components/pages/SettingsPage.jsx` | Settings: account, usage, databases, prefs |
| `src/components/WordCard.jsx` | Word card component (definitions, pitch, furigana) |
| `src/components/BottomNav.jsx` | M3 bottom navigation bar |
| `src/styles/global.css` | Global styles |

### Build & config

| File | Purpose |
|------|---------|
| `vite.config.js` | Vite build config |
| `package.json` | Dependencies, `npm run build` script |
| `dist/` | Build output (gitignored), deployed to GitHub Pages |

### Legacy & reference

| File | Purpose |
|------|---------|
| `kanji-hunt.html` | **Legacy** single-file version. NOT the build source. Kept for reference but do not edit for production changes. |
| `manifest.json` | PWA manifest (app name, icon, theme) |
| `sw.js` | Service worker (app shell caching) |
| `icon-512.svg` | App icon — heiban pitch dots on yellow |
| `data/accents.txt` | Kanjium pitch accent DB (exported JSON or raw TSV) |
| `data/jlpt_lookup.json` | JLPT level lookup DB |
| `data/readings.json` | Kanji readings DB (KANJIDIC) |
| `export-data.html` | Tool to export localStorage DBs as downloadable files |
| `kanji-hunt-style-guide.md` | CSS/component visual reference |

### Test pages

| File | Purpose |
|------|---------|
| `stt-test.html` | Standalone iPhone STT test page |
| `usage-notes-test.html` | Usage notes prompt comparison (Haiku vs Sonnet) |
| `model-comparison-test.html` | fetchCoreData/fetchPitchAndSentences model comparison |
| `icon-options.html` | 15 app icon concepts |
| `pitch-grid-test.html` | 20-word pitch display test page |
| `pitch-animation-test.html` | TTS-synced pitch animation test |
| `button-animation-test.html` | Play button animation options |
| `speech-rate-test.html` | Chrome recognition throttle test |
