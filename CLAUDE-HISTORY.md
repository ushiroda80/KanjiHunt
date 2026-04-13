# Kanji Hunt — Development History

*Pre-beta development record: v2.17 → v3.3.7*

---

## Version History (major milestones)

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
- **v3.2.9** — **Differentiated listening UI for Web Speech vs Cloud STT.** Chrome/Web Speech API no longer shows "Tap to start recording" gray circle on page load — recording starts automatically. The `needsGesture` gate now only applies to Cloud STT (Safari/iOS) where `getUserMedia` requires a user gesture. Listening text says "Listening for..." (passive) on Web Speech vs "Recording..." (active) on Cloud STT.
- **v3.3.0** — **Swipe-to-delete on History page.** Swipe left (mobile touch) or click-drag left (desktop mouse) on any word in History reveals a red "Delete" button. Tap/click to remove the word from Firestore. Only one row open at a time. Vertical scroll guard prevents accidental triggers. Reuses existing `deleteWords` API with single-word array.
- **v3.3.1** — Fixed swipe-to-delete on desktop: `mouseLeave` during drag now finishes the gesture (snap open/closed) instead of cancelling, and click event after drag is suppressed so the parent `onClick` doesn't immediately close the revealed Delete button.
- **v3.3.2** — **Character limits and manual input UI.** Capture text input capped at 15 characters for Japanese, 30 for English — enforced on both manual and editing inputs. Manual input "Capture" button moved beside the text field (matching editing layout), renamed to "Go". "Try voice again" text 25% larger with 33% more spacing. **resolveEnglish prompt rewritten** to prefer native Japanese (和語/漢語) over katakana loanwords, fixing "hello → ハロー" and "potato → ポテト" mistranslations.
- **v3.3.3** — **Capture audit logging for QA review.** Fire-and-forget `logAudit` call after every successful (or partially successful) capture sends full context to a new `logAudit` Cloud Function, which stores the record in a Firestore `audit` collection with an auto-incrementing `auditId`. Payload includes: word, inputLang (ja/en), original englishInput (if applicable), resolveEnglish candidate list, coreData, pitch/sentences, kanjiDetails, and pitchSource. Capture context is plumbed through `CapturePage` → `App.handleCapture` → `WordStore.fetchOrCreateWord`, with all 4 capture call sites (Japanese voice, English auto-confirm, English fallback, candidate picking) passing the appropriate context. Fire-and-forget: `logAudit` catches all errors in `api.js`, is never awaited, and cannot break the capture flow. Also logs on Phase-2-fail path so partial captures still generate audit records.
- **v3.3.4** — **Trim audit log to capture metadata only.** Removed word-detail fields (`coreData`, `pitchAndSentences`, `kanjiDetails`, `pitchSource`, derived `quality` object) from the audit payload — these were massively redundant across captures of the same word. Going forward each audit record stores only the capture event: resolved Japanese word, inputLang, original englishInput, resolveEnglish candidates, plus audit metadata. Client consolidates the two previous `logAudit` call sites (phase-2 success/fail paths) into a single call fired at the start of `fetchOrCreateWord` — now logs all capture attempts including phase-1 failures. Backend `logAudit` Cloud Function simplified to match. Existing bloated records left as-is (not worth migrating). Result: ~90% smaller payload per record.
- **v3.3.5** — **TTS comparison test + PL-1/PL-2/PL-3 done.** Added temporary TTS A/B test in Settings (admin-only) comparing server-generated speed vs client-side `playbackRate`. Confirmed client-side approach is good enough — decided to cache at speakingRate=0.7 and adjust playbackRate for normal (1.43x) and superslow (0.64x). Test removed after validation. Marked PL-1 (Firestore security rules) and PL-2 (API quotas) as done in pipeline. Dictionary cache (PL-3) deployed to Cloud Functions: cache-aside in `fetchCoreData`, `fetchPitchAndSentences`, `fetchKanjiDetails` using shared `dictionary/{word}` Firestore collection. First capture of any word hits Claude and writes to cache; subsequent captures by any user read from cache. Single kanji lookups skip cache (result varies by sourceContext).
- **v3.3.6** — **TTS audio cache (PL-4).** `synthesizeSpeech` Cloud Function now caches audio in Firestore `tts/{word}` collection. All audio generated at `speakingRate=0.7` (slow). Client no longer sends speed to server — `playGoogleTTS` signature simplified (removed `speed` param). `HearTab` sets `audio.playbackRate` for each speed: normal=1.43x, slow=1.0x (native), superslow=0.64x. Pitch animation timing corrected with `effectiveDuration = audio.duration / playbackRate`. First play of any word hits Google TTS and caches; subsequent plays by any user are served from cache. Eliminates ~70-80% of TTS API spend.

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

---

## Tests Completed

- **iPhone STT standalone test** — Standalone test page (stt-test.html) deployed to GitHub Pages. Tested ~12 Japanese words on iPhone 16 / Safari. Accuracy on par with Chrome desktop Web Speech API. MediaRecorder selected `audio/webm;codecs=opus` format. `ENCODING_UNSPECIFIED` worked for Google Cloud STT V1.
- **iPhone full app test** — Kanji Hunt deployed to GitHub Pages (ushiroda80.github.io/KanjiHunt). Voice capture, TTS playback, word cards confirmed working on iPhone 16 / Safari.
- **Usage notes prompt iteration** — Tested multiple prompt versions for usage notes (replacing definitions with practical usage differences). Compared Haiku vs Sonnet output. Current prompt ready for further testing.

---

## Completed Phases

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

### Phase 3: Backend + auth (Firebase) ✅

**3. Firebase setup** — completed across v3.0.0–v3.3.6

*Goal: All users. Removes the need for users to manage their own API keys (biggest onboarding friction today). Enables personal accounts, cross-device sync, and unlocks Phases 4 and 5. Without this, every user's data is trapped in one browser on one device.*

**Architecture decisions (locked):**
- **Firebase Blaze plan** (pay-as-you-go). Unlocks Cloud Functions. Free tier still applies — at current scale, cost is $0-2/month. Budget alerts set up to catch spikes.
- **Client SDK: firebase-auth.js only** (via npm/Vite). No Firestore SDK on client. All data reads/writes go through Cloud Functions. Keeps the client lightweight.
- **No localStorage migration.** Clean slate — existing localStorage word data stays as-is for reference but is not imported to Firestore.
- **Server outage: generic error page.** If Cloud Functions are unreachable, show a simple "temporarily unavailable" screen. No fallback to localStorage-only mode.
- **Three separate Claude Cloud Functions** (Option B). Called in parallel from client, matching current progressive-fill UX where the word card fills in as each response arrives.

#### Step 1: Firebase project setup ✅
- Created Firebase project (`kanji-hunt`)
- Enabled Authentication → Google sign-in provider
- Enabled Firestore (started in test mode, locked down in Step 5)
- Enabled Cloud Functions (Blaze plan)
- Budget alerts set in Google Cloud Console

#### Step 2: Cloud Functions — API proxy ✅

Eleven Cloud Functions deployed. All verify Firebase auth token before processing. API keys stored as Cloud Functions environment config (never in client code).

| Function | Proxies | Client sends | Server-side key |
|----------|---------|-------------|-----------------|
| `fetchCoreData` | `callAnthropic` (core word data) | word, sourceContext | `ANTHROPIC_API_KEY` |
| `fetchPitchAndSentences` | `callAnthropic` (pitch + examples) | word, skipPitch, jlpt, definitions | `ANTHROPIC_API_KEY` |
| `fetchKanjiDetails` | `callAnthropic` (kanji breakdown) | word | `ANTHROPIC_API_KEY` |
| `resolveEnglish` | `resolveEnglishToJapanese` | englishWord | `ANTHROPIC_API_KEY` |
| `recognizeSpeech` | Google Cloud STT | audioBase64, lang, mimeType | `GOOGLE_STT_KEY` |
| `synthesizeSpeech` | Google TTS | text, hiraganaHint, speed | `GOOGLE_TTS_KEY` |

Each function: verify auth → check rate limit → call API with server-side key → return result.

**Testing:** Each function can be tested independently with `curl` + a valid auth token before touching client code.

#### Step 3: Client-side auth + API migration ✅ (v3.0.0)

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

#### Step 4: Rate limiting ✅ (v3.1.0)

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

#### Step 5: Firestore security rules ✅

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

#### Step 7: Cost protection ✅

- Set per-API quotas in Google Cloud Console → APIs & Services → Quotas for Google STT, TTS, and Cloud Functions (e.g. 1,000 requests/day hard cap per API)
- Budget alert already set at ¥1,000/month with notifications at 50%, 90%, 100%
- Note: Firebase budget alerts are notifications only — they do NOT cap spending. API quotas are the actual hard stop against runaway bugs or misconfigs.

#### Implementation sequence (all done)
```
Step 1 (Firebase setup) → ✅ DONE — project created, Blaze plan, Auth + Firestore enabled
Step 2 (Cloud Functions) → ✅ DONE — 7 functions deployed to asia-northeast1, invoker: "public"
Step 3 (Client auth + migration) → ✅ DONE — v3.0.0: Firebase Auth + Cloud Function proxy, v3.1.3: STT pipeline stable
Step 4 (Rate limiting) → ✅ DONE — backend in Step 2, UI in v3.1.0 (badge + Settings card + modal)
Step 5 (Security rules) → ✅ DONE — Firestore rules deployed, each user locked to own data
Step 6 (Admin) → TODO — admin Cloud Functions + in-app panel, lower priority
Step 7 (Cost protection) → ✅ DONE — per-API daily quotas set in Google Cloud Console
```

#### Security checklist (all complete)

- ✅ Firebase auth tokens on every Cloud Function request (Step 2)
- ✅ Rate limiting per user (Step 4)
- ✅ Service account key excluded from git via `.gitignore` (v3.2.0)
- ✅ Dependabot alerts enabled on GitHub for dependency vulnerabilities
- ✅ No API keys in client code (all server-side in Cloud Functions)
- ✅ Firestore security rules — each user locked to own data (Step 5)
- ✅ Per-API daily quotas in Google Cloud Console — hard ceiling on spend (Step 7)

---

## Completed Pipeline Items

**PL-1. Firestore security rules** — ✅ DONE

**PL-2. API quotas** — ✅ DONE

**PL-3. Dictionary cache** — ✅ DONE
*Deployed:* Cache-aside in `fetchCoreData`, `fetchPitchAndSentences`, `fetchKanjiDetails` Cloud Functions. First capture of any word hits Claude and writes to `dictionary/{word}` Firestore collection; subsequent captures by any user read from cache. Single kanji lookups skip cache (result varies by sourceContext). Sentences cached per JLPT level (`sentences.N4`, etc.).

**PL-4. TTS audio cache** — ✅ DONE
*Deployed:* `synthesizeSpeech` Cloud Function caches audio in Firestore `tts/{word}`. All audio generated at `speakingRate=0.7`. Client sets `audio.playbackRate` for other speeds (normal=1.43x, superslow=0.64x). One cached clip serves all three speed buttons. First play hits Google TTS; subsequent plays by any user served from cache.
