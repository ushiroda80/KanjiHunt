import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// ============================================
// FIREBASE INIT
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyAONlO5vAGAZb3zux6iQGORuksnqsJ7PKc",
  authDomain: "kanji-hunt.firebaseapp.com",
  projectId: "kanji-hunt",
  storageBucket: "kanji-hunt.firebasestorage.app",
  messagingSenderId: "443591225699",
  appId: "1:443591225699:web:91ec7ef21a6f33c6506356"
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

// Cloud Function base URLs (asia-northeast1)
export const CF_URLS = {
  fetchCoreData: 'https://fetchcoredata-paobljo2bq-an.a.run.app',
  fetchPitchAndSentences: 'https://fetchpitchandsentences-paobljo2bq-an.a.run.app',
  fetchKanjiDetails: 'https://fetchkanjidetails-paobljo2bq-an.a.run.app',
  resolveEnglish: 'https://resolveenglish-paobljo2bq-an.a.run.app',
  recognizeSpeech: 'https://recognizespeech-paobljo2bq-an.a.run.app',
  synthesizeSpeech: 'https://synthesizespeech-paobljo2bq-an.a.run.app',
  getUsage: 'https://getusage-paobljo2bq-an.a.run.app',
  // Streaming STT WebSocket server (Cloud Run)
  // Dev: routes through Vite proxy (vite.config.js /ws-stt → ws://localhost:8080)
  // Prod: direct wss:// to Cloud Run service
  streamingSTT: import.meta.env.DEV
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws-stt`
    : 'wss://kanji-hunt-streaming-stt-443591225699.asia-northeast1.run.app'
};

// Get fresh auth token (auto-refreshes if expired)
export async function getAuthToken() {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('not-signed-in');
  return await user.getIdToken();
}
