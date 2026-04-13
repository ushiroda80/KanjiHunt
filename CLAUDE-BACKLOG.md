# Kanji Hunt — Backlog

*Research, ideas, and future work*

---

## Phase 3 Step 6: Admin Tooling (TODO)

*Only incomplete Phase 3 item.*

- Admin Cloud Functions: `resetUsage`, `getStats`, `wipeDictionaryCache`
- In-app admin panel in Settings — visible only when signed in as developer email
- Firebase Console covers everything else

---

## Product Research Backlog

### Natural translation selection (English → Japanese)

*Problem: When capturing from English, the app may return a literal word-for-word translation that exists but isn't how Japanese speakers naturally express the concept. E.g. "business competitor" → 事業競争者 (literal, rarely used) vs 競合他社 or ライバル (natural).*

*Goal: Default-select the most natural equivalent. Show alternatives (including literal if it's a real word) with visual cues that help the user understand the difference — without confusing them.*

**Status: Partially addressed in v3.3.2.** The `resolveEnglish` prompt was rewritten to prefer native Japanese (和語/漢語) over katakana loanwords, fixing the most egregious cases (hello → ハロー, potato → ポテト). The broader research questions below remain open — context tags, frequency data, and differentiation UI for the picking page.

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
- **Word review / curation UI** — Admin or contracted translator needs a way to review all captured words across users, see the English input that triggered each capture, search/filter, and manually correct word details (definitions, JLPT, etc.). Purpose: build a high-quality curated dictionary over time and catch bad model outputs. Scope and approach TBD — keep it simple and proportional to the problem.
- SRS / spaced repetition for practice mode
- Audio-only review (play word, recall before flip)
- Shared/group word lists (classroom, study groups)
- Anki deck export
- Word frequency ranking
- Sentence mining (capture sentences, extract words)
- Offline capture with background sync
- Monetization (subscription model, usage tiers)

---

## Operational Backlog

### Cloud Storage cleanup (~5 min, saves ~300MB)
**What:** The Google Cloud Storage bucket `run-sources-kanji-hunt-asia-northeast1` holds deployment zips for the streaming STT Cloud Run service. Each deploy creates a ~307MB zip (large because `@google-cloud/speech` bundles gRPC binaries and protobuf definitions). Two deploys = ~614MB. This is what drives the 588MB figure on the Firebase dashboard — not user data.

**Why it doesn't affect scaling:** This storage grows with *deploys*, not *users*. Our actual user data (Firestore words, audit records, usage) is negligible. Even at 1,000 users with 100 words each, Firestore would be under 100MB.

**Fix:** Delete the older zip in the bucket (the Apr 4, 12:xx one). The newer one is the active deployment. Optionally add a `.gcloudignore` to the streaming STT project to slim future deploys. Neither is urgent — storage cost at this level is pennies/month.
