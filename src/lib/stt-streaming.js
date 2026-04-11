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
const SPEECH_RMS = 4; // RMS threshold for volume bar color (0-128 scale from AnalyserNode)
const MIC_HEALTH_RMS = 0.3; // minimum RMS to confirm mic is alive (dead mic = exactly 0.0)
const MIC_HEALTH_SHOW_MS = 200; // show "warming up" if health check takes longer than this
const MIC_HEALTH_TIMEOUT_MS = 2000; // give up and retry after this long
const MIC_HEALTH_SETTLE_MS = 300; // wait after teardown before retrying getUserMedia

export function recognizeWithStreamingSTT(lang) {
  lang = lang || 'ja-JP';
  var ctrl = { stop: null, cancel: null, updateMeter: null, log: null, setWarmingUp: null };
  var logMsg = function(msg) { if (ctrl.log) ctrl.log(msg); };

  var promise = new Promise(async function(resolve, reject) {
    var cancelled = false;
    var finalReceived = false;
    var stream = null;
    var audioCtx = null;
    var workletNode = null;
    var analyser = null;
    var rafId = null;
    var ws = null;
    var stopTimer = null;
    var finalTimer = null;
    var t0 = Date.now(); // absolute start (tap mic)
    var setupDoneT0 = 0;
    var lastAudioAt = 0;
    var speechStartAt = 0; // first time volume crosses speech threshold
    var speechEndAt = 0; // last moment of speech (updated continuously while loud)
    var speechEndLogged = false; // only log "speech ended" once
    var endOfUtteranceAt = 0; // when Google says "you're done talking"
    var firstChunkAt = 0; // first audio chunk sent to server

    function cleanup() {
      clearTimeout(stopTimer);
      clearTimeout(finalTimer);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (analyser) { try { analyser.disconnect(); } catch(e) {} analyser = null; }
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
      await audioCtx.audioWorklet.addModule(import.meta.env.BASE_URL + 'pcm-processor.js');

      logMsg('🎙 Mic ready (' + (Date.now() - t0) + 'ms)');
      logMsg('🔊 Audio engine ready (' + audioCtx.sampleRate + 'Hz)');
      if (cancelled) { cleanup(); return; }

      // Connect WebSocket to streaming STT server
      var wsUrl = CF_URLS.streamingSTT + '?token=' + encodeURIComponent(token) + '&lang=' + lang;
      ws = new WebSocket(wsUrl);
      var wsConnectT0 = Date.now();

      // Wait for WebSocket to open
      await new Promise(function(res, rej) {
        ws.onopen = function() {
          logMsg('🔌 Server connected (' + (Date.now() - wsConnectT0) + 'ms)');
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
            endOfUtteranceAt = Date.now();
            var waitMs = speechEndAt ? (endOfUtteranceAt - speechEndAt) : 0;
            logMsg('🔇 Google says done' + (waitMs ? ' (' + waitMs + 'ms after you stopped)' : ''));
            return;
          }
          if (msg.type === 'final') {
            finalReceived = true;
            var now = Date.now();
            var setupMs = setupDoneT0 - t0;
            var speakingMs = (speechStartAt && speechEndAt) ? (speechEndAt - speechStartAt) : 0;
            var googleThinkMs = (speechEndAt && endOfUtteranceAt) ? (endOfUtteranceAt - speechEndAt) : (speechEndAt ? (now - speechEndAt) : 0);
            var resultMs = endOfUtteranceAt ? (now - endOfUtteranceAt) : 0;
            var totalMs = now - t0;
            logMsg('✅ Result: "' + msg.transcript + '" (' + Math.round((msg.confidence || 0) * 100) + '%)');
            logMsg('📊 TOTAL: ' + totalMs + 'ms (setup ' + setupMs + 'ms + speaking ' + speakingMs + 'ms + Google thinking ' + googleThinkMs + 'ms + result ' + resultMs + 'ms)');
            cleanup();
            resolve({
              transcript: msg.transcript || '',
              alternatives: msg.alternatives || [],
              confidence: msg.confidence || 0,
              timing: { streaming: true, setupMs: setupMs, speakingMs: speakingMs, googleThinkMs: googleThinkMs, resultMs: resultMs, totalMs: totalMs }
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

      // AnalyserNode for 60fps volume meter + local silence detection
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      var analyserBuf = new Uint8Array(analyser.fftSize);

      // --- Mic health check: verify non-zero audio before declaring ready ---
      // On iOS Safari cold starts, getUserMedia can resolve with a silently dead stream.
      // Poll AnalyserNode for non-zero RMS. If dead, tear down mic and retry once.
      var healthPassed = false;
      var healthT0 = Date.now();
      var showedWarmup = false;
      while (!healthPassed && !cancelled) {
        analyser.getByteTimeDomainData(analyserBuf);
        var healthSum = 0;
        for (var hi = 0; hi < analyserBuf.length; hi++) {
          var hv = analyserBuf[hi] - 128;
          healthSum += hv * hv;
        }
        var healthRms = Math.sqrt(healthSum / analyserBuf.length);
        if (healthRms > MIC_HEALTH_RMS) { healthPassed = true; break; }

        var healthElapsed = Date.now() - healthT0;
        if (healthElapsed > MIC_HEALTH_SHOW_MS && !showedWarmup) {
          showedWarmup = true;
          if (ctrl.setWarmingUp) ctrl.setWarmingUp(true);
          logMsg('⏳ Warming up mic...');
        }
        if (healthElapsed > MIC_HEALTH_TIMEOUT_MS) break;
        await new Promise(function(r) { setTimeout(r, 50); });
      }

      // Retry once if mic was dead
      if (!healthPassed && !cancelled) {
        logMsg('🔄 Mic silent — retrying...');
        // Tear down mic + audio context (keep WebSocket alive)
        if (analyser) { try { analyser.disconnect(); } catch(e) {} analyser = null; }
        if (workletNode) { try { workletNode.disconnect(); } catch(e) {} workletNode = null; }
        if (audioCtx) { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
        if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }

        await new Promise(function(r) { setTimeout(r, MIC_HEALTH_SETTLE_MS); });
        if (cancelled) { cleanup(); return; }

        // Re-acquire mic + rebuild audio graph
        stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(function() {
          throw new Error('mic-denied');
        });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        await audioCtx.audioWorklet.addModule(import.meta.env.BASE_URL + 'pcm-processor.js');

        workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(workletNode);
        var silentGain2 = audioCtx.createGain();
        silentGain2.gain.value = 0;
        workletNode.connect(silentGain2);
        silentGain2.connect(audioCtx.destination);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.1;
        source.connect(analyser);
        analyserBuf = new Uint8Array(analyser.fftSize);

        // Second health check
        healthT0 = Date.now();
        while (!healthPassed && !cancelled) {
          analyser.getByteTimeDomainData(analyserBuf);
          var healthSum2 = 0;
          for (var hi2 = 0; hi2 < analyserBuf.length; hi2++) {
            var hv2 = analyserBuf[hi2] - 128;
            healthSum2 += hv2 * hv2;
          }
          if (Math.sqrt(healthSum2 / analyserBuf.length) > MIC_HEALTH_RMS) { healthPassed = true; break; }
          if (Date.now() - healthT0 > MIC_HEALTH_TIMEOUT_MS) break;
          await new Promise(function(r) { setTimeout(r, 50); });
        }

        if (!healthPassed) {
          if (showedWarmup && ctrl.setWarmingUp) ctrl.setWarmingUp(false);
          logMsg('❌ Mic still silent after retry');
          cleanup();
          reject(new Error('mic-dead'));
          return;
        }
        logMsg('✅ Mic recovered after retry');
      }

      if (showedWarmup && ctrl.setWarmingUp) ctrl.setWarmingUp(false);
      if (cancelled) { cleanup(); return; }

      function meterLoop() {
        if (finalReceived || cancelled) return;
        analyser.getByteTimeDomainData(analyserBuf);
        var sum = 0;
        for (var i = 0; i < analyserBuf.length; i++) {
          var v = analyserBuf[i] - 128;
          sum += v * v;
        }
        var rms = Math.sqrt(sum / analyserBuf.length);

        // Volume meter at 60fps
        if (ctrl.updateMeter) {
          var pct = Math.min(100, rms * 6);
          ctrl.updateMeter(pct, rms > SPEECH_RMS ? '#ffe600' : 'rgba(255,255,255,0.15)');
        }

        // Track when you start and stop speaking (for timing log only — no behavior change)
        if (rms > SPEECH_RMS) {
          if (!speechStartAt) {
            speechStartAt = Date.now();
            logMsg('🗣 Speech detected (' + (speechStartAt - setupDoneT0) + 'ms into recording)');
          }
          speechEndAt = Date.now(); // continuously update to track last loud moment
          speechEndLogged = false;
        } else if (speechStartAt && !speechEndLogged && rms < 2) {
          speechEndLogged = true;
          logMsg('🤫 Speech ended (' + (speechEndAt - speechStartAt) + 'ms of speech)');
        }

        rafId = requestAnimationFrame(meterLoop);
      }

      workletNode.port.onmessage = function(e) {
        if (finalReceived || cancelled) return;
        var buffer = e.data; // ArrayBuffer of Int16 PCM (~200ms at 16kHz)
        lastAudioAt = Date.now();
        if (!firstChunkAt) {
          firstChunkAt = lastAudioAt;
          logMsg('▶️ First audio sent to Google (' + (firstChunkAt - setupDoneT0) + 'ms after setup)');
        }

        // Stream raw PCM to server as binary message
        if (ws && ws.readyState === 1) {
          ws.send(buffer);
        }
      };

      setupDoneT0 = Date.now();
      rafId = requestAnimationFrame(meterLoop);
      logMsg('▶️ Listening (setup took ' + (setupDoneT0 - t0) + 'ms)');

      // Hard cap — send stop after MAX_MS even if Google hasn't auto-detected silence
      stopTimer = setTimeout(function() {
        logMsg('⏰ Hard cap');
        if (ctrl.stop) ctrl.stop();
      }, MAX_MS);

      ctrl.stop = function() {
        if (finalReceived || cancelled) return;
        logMsg('⏹ Stop — flushing worklet');
        clearTimeout(stopTimer);
        // Tear down meter first (frees resources)
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (analyser) { try { analyser.disconnect(); } catch(e) {} analyser = null; }
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
