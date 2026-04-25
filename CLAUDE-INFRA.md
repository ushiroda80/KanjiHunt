# Kanji Hunt — Infrastructure Reference

Cloud Function URLs, Firebase config, secrets, and local dev paths. Lookup material — read on demand.

---

## Cloud Function URLs (asia-northeast1)

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

---

## Firebase Config (public, embedded in client)

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

---

## Secrets

Set via `firebase functions:secrets:set`. Never embed in client.

- `ANTHROPIC_API_KEY` — Anthropic API key (for Claude calls)
- `GOOGLE_STT_KEY` — Google Cloud Speech-to-Text key
- `GOOGLE_TTS_KEY` — Google Cloud Text-to-Speech key

---

## Local dev paths

- Firebase project root: `/Users/JKO/`
- Cloud Functions code: `/Users/JKO/functions/index.js`
- Firebase config: `/Users/JKO/firebase.json`
- Deploy command (Cloud Functions): `cd /Users/JKO && firebase deploy --only functions`
