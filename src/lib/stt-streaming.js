// ============================================
// STREAMING SPEECH-TO-TEXT — WebSocket + AudioWorklet
// Bridges browser mic → Google Cloud Speech streamingRecognize
// via the kanji-hunt-streaming-stt Cloud Run server.
//
// Mirrors recognizeWithCloudSTT() interface exactly:
//   - Returns Promise with .ctrl
//   - ctrl.stop(), ctrl.cancel(), ctrl.updateMeter, ctrl.log
//   - Resolves with { transcript, alternatives, confidence, timing }
// ============================================

import { firebaseAuth, CF_URLS, getAuthToken } from '../config/firebase.js';

const MAX_MS = 8000; // hard cap: send stop after 8s even without silence

export function recognizeWithStreamingSTT(lang) {
  lang = lang || 'ja-JP';
  var ctrl = { stop: null, cancel: null, updateMeter: null, log: null };
  var logMsg = function(msg) { if (ctrl.log) ctrl.log(msg); };

  var promise = new Promise(async function(resolve, reject) {
    var cancelled = false;
    var finalReceived = false;
    var stream = null;
    var audioCtx = null;
    var workletNode = null;
    var ws = null;
    var stopTimer = null;
    var finalTimer = null;
    var setupDoneT0 = 0;
    var lastAudioAt = 0;

    function cleanup() {
      clearTimeout(stopTimer);
      clearTimeout(finalTimer);
      if (workletNode) {
        try { workletNode.port.postMessage('flush'); workletNode.disconnect(); } catch(e) {}
        workletNode = null;
      }
      if (audioCtx) { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
      if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
      if (ws && ws.readyState < 2) { try { ws.close(); } catch(e) {} }
    }

    if (!firebaseAuth.currentUser) return reject(new Error('not-signed-in'));

    try {
      // Get mic + auth token in parallel to minimize setup latency
      var results = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: true }).catch(function() {
          throw new Error('mic-denied');
        }),
        getAuthToken()
      ]);
      stream = results[0];
      var token = results[1];

      if (cancelled) { cleanup(); return; }

      // Set up AudioContext + load AudioWorklet processor
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      await audioCtx.audioWorklet.addModule('/pcm-processor.js');

      logMsg('🔊 AudioCtx: ' + audioCtx.state + ', ' + audioCtx.sampleRate + 'Hz');
      if (cancelled) { cleanup(); return; }

      // Connect WebSocket to streaming STT server
      var wsUrl = CF_URLS.streamingSTT + '?token=' + encodeURIComponent(token) + '&lang=' + lang;
      ws = new WebSocket(wsUrl);
      var wsConnectT0 = Date.now();

      // Wait for WebSocket to open
      await new Promise(function(res, rej) {
        ws.onopen = function() {
          logMsg('🔌 WS connected (' + (Date.now() - wsConnectT0) + 'ms)');
          res();
        };
        ws.onerror = function() { rej(new Error('stt-network-error')); };
        ws.onclose = function() { if (!finalReceived) rej(new Error('stt-network-error')); };
      });

      if (cancelled) { cleanup(); return; }

      // Post-connection message handlers
      ws.onmessage = function(e) {
        if (finalReceived || cancelled) return;
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'end_of_utterance') {
            logMsg('🔇 End of utterance');
            return;
          }
          if (msg.type === 'final') {
            finalReceived = true;
            var apiMs = lastAudioAt ? (Date.now() - lastAudioAt) : 0;
            var captureMs = lastAudioAt ? (lastAudioAt - setupDoneT0) : 0;
            logMsg('✅ Streaming final: "' + msg.transcript + '" (' + Math.round((msg.confidence || 0) * 100) + '%, api: ' + apiMs + 'ms)');
            cleanup();
            resolve({
              transcript: msg.transcript || '',
              alternatives: msg.alternatives || [],
              confidence: msg.confidence || 0,
              timing: { captureMs: captureMs, packMs: 0, apiMs: apiMs }
            });
          }
          if (msg.type === 'error') {
            logMsg('❌ Server error: ' + msg.message);
            if (!cancelled) { cleanup(); reject(new Error('stt-api-error')); }
          }
        } catch(parseErr) { /* ignore malformed server message */ }
      };

      ws.onerror = function() {
        if (!finalReceived && !cancelled) { cleanup(); reject(new Error('stt-network-error')); }
      };
      ws.onclose = function() {
        if (!finalReceived && !cancelled) { cleanup(); reject(new Error('stt-network-error')); }
      };

      // Set up AudioWorklet: mic → worklet → WebSocket
      workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
      var source = audioCtx.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Connect to silent gain to keep audio graph active in all browsers
      var silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      workletNode.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      workletNode.port.onmessage = function(e) {
        if (finalReceived || cancelled) return;
        var buffer = e.data; // ArrayBuffer of Int16 PCM (~200ms at 16kHz)
        lastAudioAt = Date.now();

        // Compute RMS for volume meter (Int16 → float scale)
        if (ctrl.updateMeter) {
          var samples = new Int16Array(buffer);
          var sum = 0;
          for (var i = 0; i < samples.length; i++) { sum += samples[i] * samples[i]; }
          var rmsInt16 = Math.sqrt(sum / samples.length);
          var pct = Math.min(100, rmsInt16 / 32767 * 800);
          ctrl.updateMeter(pct, rmsInt16 > 1000 ? '#ffe600' : 'rgba(255,255,255,0.15)');
        }

        // Stream raw PCM to server as binary message
        if (ws && ws.readyState === 1) {
          ws.send(buffer);
        }
      };

      setupDoneT0 = Date.now();
      logMsg('▶️ Streaming');

      // Hard cap — send stop after MAX_MS even if Google hasn't auto-detected silence
      stopTimer = setTimeout(function() {
        logMsg('⏰ Hard cap');
        if (ctrl.stop) ctrl.stop();
      }, MAX_MS);

      ctrl.stop = function() {
        if (finalReceived || cancelled) return;
        logMsg('⏹ Stop — flushing worklet');
        clearTimeout(stopTimer);
        // Flush any remaining buffered samples from worklet before stopping audio capture
        if (workletNode) workletNode.port.postMessage('flush');
        // Brief delay to let the flush message deliver
        setTimeout(function() {
          if (workletNode) { try { workletNode.disconnect(); } catch(e) {} workletNode = null; }
          if (audioCtx) { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
          if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
          // Signal server to finalize the recognition stream
          if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'stop' }));
          // If no final result arrives within 3s, treat as no-audio
          finalTimer = setTimeout(function() {
            if (!finalReceived) { cleanup(); reject(new Error('no-audio')); }
          }, 3000);
        }, 80);
      };

      ctrl.cancel = function() {
        cancelled = true;
        cleanup();
        // Promise hangs intentionally — CapturePage discards it via gotFinalRef check in catch handler
      };

    } catch(err) {
      cleanup();
      if (!cancelled) reject(err);
    }
  });

  promise.ctrl = ctrl;
  return promise;
}
