// Kanji Hunt Streaming STT — WebSocket server for Cloud Run
// Bridges browser AudioWorklet → Google Cloud Speech streamingRecognize

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SpeechClient } from '@google-cloud/speech';
import admin from 'firebase-admin';

// Firebase Admin — on Cloud Run, credentials come from default service account
admin.initializeApp();
const speechClient = new SpeechClient();

const PORT = process.env.PORT || 8080;

// CORS origins for upgrade requests
const ALLOWED_ORIGINS = [
  'https://ushiroda80.github.io',
  'http://localhost:3000',
  'https://localhost:3000',
  'http://localhost:8080',
  'ws://localhost:8080',
  'https://192.168.11.15:3000',
];

const server = createServer((req, res) => {
  // Health check for Cloud Run
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  // Check origin
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`[ws] Rejected origin: ${origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Extract token and lang from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const lang = url.searchParams.get('lang') || 'ja-JP';

  if (!token) {
    console.log('[ws] No token provided');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify Firebase auth token
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log(`[ws] Authenticated: ${decoded.uid} (${lang})`);
  } catch (err) {
    console.log(`[ws] Invalid token: ${err.message}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, lang);
  });
});

wss.on('connection', (ws, req, lang) => {
  console.log(`[ws] Connected (${lang})`);
  let recognizeStream = null;
  let finalSent = false;

  // Create Google Speech streaming session
  recognizeStream = speechClient.streamingRecognize({
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: lang,
      model: 'command_and_search',
      useEnhanced: true,
      maxAlternatives: 4,
      enableAutomaticPunctuation: false,
    },
    interimResults: false, // finals only for now — interim transcripts parked
    singleUtterance: true, // Google auto-detects end of speech
  });

  recognizeStream.on('data', (response) => {
    if (finalSent) return;

    // Check for END_OF_SINGLE_UTTERANCE event
    if (response.speechEventType === 'END_OF_SINGLE_UTTERANCE') {
      console.log(`[ws] End of utterance detected`);
      safeSend(ws, { type: 'end_of_utterance' });
      return;
    }

    const result = response.results && response.results[0];
    if (!result) return;

    if (result.isFinal) {
      finalSent = true;
      const alt = result.alternatives || [];
      const transcript = alt[0]?.transcript || '';
      const confidence = alt[0]?.confidence || 0;
      const alternatives = alt.slice(0, 4).map(a => ({
        transcript: a.transcript || '',
        confidence: a.confidence || 0
      }));

      console.log(`[ws] Final: "${transcript}" (${Math.round(confidence * 100)}%)`);
      safeSend(ws, {
        type: 'final',
        transcript,
        alternatives,
        confidence
      });
    }
  });

  recognizeStream.on('error', (err) => {
    console.error(`[ws] Speech stream error: ${err.message}`);
    if (!finalSent) {
      safeSend(ws, { type: 'error', message: err.message });
    }
    cleanupStream();
  });

  recognizeStream.on('end', () => {
    console.log('[ws] Speech stream ended');
    cleanupStream();
  });

  // Handle incoming messages
  ws.on('message', (data, isBinary) => {
    if (finalSent || !recognizeStream) return;

    if (isBinary) {
      // Raw Int16 PCM audio — pipe to Google
      try {
        recognizeStream.write(data);
      } catch (err) {
        console.error(`[ws] Write error: ${err.message}`);
      }
    } else {
      // JSON control message
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'stop') {
          console.log('[ws] Client sent stop');
          if (recognizeStream) {
            recognizeStream.end();
          }
        }
      } catch (e) {
        console.error(`[ws] Bad JSON: ${e.message}`);
      }
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    cleanupStream();
  });

  ws.on('error', (err) => {
    console.error(`[ws] WebSocket error: ${err.message}`);
    cleanupStream();
  });

  function cleanupStream() {
    if (recognizeStream) {
      try { recognizeStream.end(); } catch (e) {}
      recognizeStream = null;
    }
  }

  function safeSend(ws, obj) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[streaming-stt] Listening on port ${PORT}`);
});
