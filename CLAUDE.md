# Kanji Hunt — Product Guide

*v3.3.8 · April 2026*

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

5. **Capture speed matters.** The path from "I heard a word" to "card saved" should be as few taps as possible. Auto-select when confidence is high (≥70%). Only show disambiguation when alternatives genuinely compete (≥20%). Input limits: 15 chars Japanese, 30 chars English (prevents garbage input and API abuse).

6. **Progressive disclosure.** Show the essential info first (word, reading, top definition). Details (kanji breakdown, all definitions, pitch pattern explanation) are available but not forced.

---

## Architecture Decisions

Decisions that were non-obvious and would be expensive to re-derive.

*For full version history, investigation retros, and completed phase specs, see [CLAUDE-HISTORY.md](CLAUDE-HISTORY.md).*

### Data flow — capture pipeline
```
Stage 1 RECORD: getSpeechMethod() → webSpeech | cloudSTT | manual → { transcript, alternatives }
Stage 2 RESOLVE: Japanese → direct capture. English → resolveEnglishToJapanese() → picking UI or auto-select.
Stage 3 LOOKUP: fetchCoreData() + fetchPitchAndSentences() + fetchKanjiDetails() → normalize() → render
```
Adding a new input method = new Stage 1 adapter. Adding a new language = new Stage 2 resolver.

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
- Chrome Web Speech API: ~10-20% silent failure rate for single-syllable words. 250ms visual delay on capture start. Has built-in silence detection (no AnalyserNode needed). Starts automatically on page load — no tap-to-start gate (Chrome's own permission prompt handles consent).
- **Tap-to-start gate:** Only applies to Cloud STT (Safari/iOS) where `getUserMedia` requires a prior user gesture. Module-level `hasUserGesture` flag flips on first `touchstart`/`click`. Web Speech API skips this entirely (v3.2.9+).
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

### What's known broken or incomplete
- Practice mode is a placeholder — no real quiz/SRS logic yet
- Speech recognition has inherent ~10-20% failure rate on Chrome (Web Speech API limitation)
- Cloud STT has ~1s latency + variable recording window (no streaming)
- Very long words (10+ morae) may need horizontal scroll in pitch display
- Service worker caches aggressively — users may need `?v=N` param to bust cache on updates
- `kanji-hunt.html` (legacy single-file) is out of sync with `src/` — do not use as reference for current behavior

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Kanji font | `Noto Serif JP` | Extensive testing across serif/sans options. Best balance of readability, stroke clarity, and aesthetic at large display sizes. **Only used on Learn page word card, History page kanji, and Picking page kanji display.** Capture page uses system font throughout. Do not change without explicit revisit. |
| Pitch accent visualization | Custom SVG grid (36px columns, pure math positioning) | No DOM measurement, no render-measure-rerender. Keep implementation exactly as-is — fragile to change. |
| Definition display tags | `common` / `uncommon` / `rare` frequency labels | Deliberate taxonomy after iterating on alternatives. Keep existing display logic unless specifically revisiting. |
| JLPT badge colors | N5 green → N4 lime → N3 amber → N2 pink → N1 red | Consistent across Learn and History pages. Do not change without updating both. |

---

## Infrastructure Reference

### Cloud Function URLs (asia-northeast1)
```
fetchCoreData:          https://fetchcoredata-paobljo2bq-an.a.run.app
fetchPitchAndSentences: https://fetchpitchandsentences-paobljo2bq-an.a.run.app
fetchKanjiDetails:      https://fetchkanjidetails-paobljo2bq-an.a.run.app
resolveEnglish:         https://resolveenglish-paobljo2bq-an.a.run.app
recognizeSpeech:        https://recognizespeech-paobljo2bq-an.a.run.app
synthesizeSpeech:       https://synthesizespeech-paobljo2bq-an.a.run.app
getUsage:               https://getusage-paobljo2bq-an.a.run.app
getWords:               https://asia-northeast1-kanji-hunt.cloudfunctions.net/getWords
saveWord:               https://asia-northeast1-kanji-hunt.cloudfunctions.net/saveWord
updateWordField:        https://asia-northeast1-kanji-hunt.cloudfunctions.net/updateWordField
deleteWords:            https://asia-northeast1-kanji-hunt.cloudfunctions.net/deleteWords
```

Each function: verify auth → check rate limit → call API with server-side key → return result. See [CLAUDE-HISTORY.md](CLAUDE-HISTORY.md) Phase 3 Step 2 for full proxy table.

### Firebase Config (public, embedded in client)
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

### Secrets (set via `firebase functions:secrets:set`)
- `ANTHROPIC_API_KEY` — Anthropic API key (for Claude calls)
- `GOOGLE_STT_KEY` — Google Cloud Speech-to-Text key
- `GOOGLE_TTS_KEY` — Google Cloud Text-to-Speech key

### Local dev
- Firebase project root: `/Users/JKO/`
- Cloud Functions code: `/Users/JKO/functions/index.js`
- Firebase config: `/Users/JKO/firebase.json`
- Deploy command: `cd /Users/JKO && firebase deploy --only functions`

### Working process
- Tadashi is the PM, not an engineer. Never ask him to make code changes manually. Always make code changes directly.
- For Cloud Functions: provide the full `index.js` file, ready to drop into `/Users/JKO/functions/`. Tadashi deploys via `firebase deploy --only functions`.
- For client code: **edit files in `src/`** (not `kanji-hunt.html`). The app is built with Vite from `src/`. Use the `/deploy` skill — it handles version bump, `npm run build`, commit, and push automatically.

---

## Pipeline

Phases 1–3 complete. PL-1 through PL-4 shipped. *For details on completed items, see [CLAUDE-HISTORY.md](CLAUDE-HISTORY.md).*

*For research backlog, future ideas, and operational tasks, see [CLAUDE-BACKLOG.md](CLAUDE-BACKLOG.md).*

**PL-5. Word review / curation UI** — scope TBD
*Why:* Need a way for an admin or contracted translator to review all captured words across users, spot bad model outputs, and manually correct word details. Builds a high-quality curated dictionary over time. Approach intentionally deferred until dictionary cache (PL-3) establishes the shared data model it would edit.

**PL-6. Practice mode (SRS)** — scope TBD
*Why:* The capture side is strong but there's no way to review/quiz what you've learned. Spaced repetition turns the word list into an active study tool.

### Data architecture (Firebase)

```
users/
  {uid}/
    settings: { defaultLang, tipsEnabled }
    words/
      {wordId}: { kanji, hiragana, capturedAt, pinned, ... }

dictionary/
  {word}: { coreData, pitchAccent, sentences.{level}, kanjiDetails, cachedAt }

tts/
  {word}: { audioContent: "base64...", cachedAt }
```

### Cost projection (post-cache, 50 beta users)
- Mixed usage: ~$15-40/month total
- Firebase free tier covers auth + Firestore for this scale
- Main cost is Claude API + Google TTS for cache misses (new words only)

---

## Codebase

Client code is in `src/` — key modules: `lib/` (STT, API, pitch, word storage), `components/` (React pages and UI), `config/` (Firebase init). Build with `npm run build` → `dist/`.

**Warning:** `kanji-hunt.html` in the repo root is a **legacy** single-file version. It is NOT the build source — do not edit it for production changes.
