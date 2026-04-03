// ============================================
// STREAMING SPEECH-TO-TEXT — AudioWorklet + WebSocket
// Bypasses MediaRecorder entirely. Streams raw PCM to
// Cloud Run server running Google Speech streamingRecognize.
// ============================================

import { CF_URLS, getAuthToken } from '../config/firebase.js';

// AudioWorklet processor URL — served from public/ for Safari compatibility
const PROCESSOR_URL = (import.meta.env.BASE_URL || '/') + 'pcm-processor.js';

export function recognizeWithStreamingSTT(lang) {
  lang = lang || 'ja-JP';
  var MAX_MS = 5500;
  var METER_SCALE = 8, SPEECH_THRESH = 4, SILENCE_THRESH = 2;
  var FFT = 512, SMOOTHING = 0.1;
  var cancelled = false, stopped = false;
  var ctrl = { stop: null, cancel: null, updateMeter: null, log: null };
  var logMsg = function(msg) { if (ctrl.log) ctrl.log(msg); };

  var promise = new Promise(async function(resolve, reject) {
    var captureT0 = Date.now();
    var ws = null, audioCtx = null, stream = null, workletNode = null, stopTimer = null;
    var speechDetected = false;

    var cleanup = function() {
      stopped = true;
      clearTimeout(stopTimer);
      if (workletNode) { try { workletNode.disconnect(); } catch(e) {} workletNode = null; }
      if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
      if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
    };

    var closeWs = function() {
      if (ws && ws.readyState <= 1) {
        try { ws.close(); } catch(e) {}
      }
    };

    try {
      // Parallel setup: run auth+WS, AudioContext+Worklet, and mic simultaneously
      var setupT0 = Date.now();

      // AudioContext must be created synchronously in user gesture chain
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      // On iOS Safari without a user gesture, resume() silently no-ops — detect and fail fast
      // so CapturePage can show tap-to-start UI instead of hanging indefinitely.
      if (audioCtx.state === 'suspended') throw new Error('audio-context-suspended');

      // A: Auth token → WebSocket connect (serial chain, parallel with B+C)
      var wsReadyP = (async function() {
        var tokenT0 = Date.now();
        var token = await getAuthToken();
        logMsg('🔑 Auth token: ' + (Date.now() - tokenT0) + 'ms');

        var baseWsUrl = CF_URLS.streamingSTT;
        if (baseWsUrl === '__WS_AUTO__') {
          var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          baseWsUrl = proto + '//' + location.host + '/ws-stt';
        }
        var wsUrl = baseWsUrl + '?token=' + encodeURIComponent(token) + '&lang=' + encodeURIComponent(lang);
        logMsg('🔌 Connecting WebSocket...');
        var wsT0 = Date.now();

        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        await new Promise(function(res, rej) {
          ws.onopen = function() { res(true); };
          ws.onerror = function() { rej(new Error('ws-connect-error')); };
          setTimeout(function() { rej(new Error('ws-connect-timeout')); }, 5000);
        });
        logMsg('🔌 WebSocket connected (' + (Date.now() - wsT0) + 'ms)');
      })();

      // B: AudioWorklet module load (parallel with A+C)
      var workletReadyP = (async function() {
        var workletT0 = Date.now();
        await audioCtx.audioWorklet.addModule(PROCESSOR_URL);
        logMsg('🔧 AudioWorklet loaded (' + (Date.now() - workletT0) + 'ms)');
      })();

      // C: Get mic (parallel with A+B)
      var micReadyP = navigator.mediaDevices.getUserMedia({ audio: true }).catch(function(e) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') throw new Error('mic-denied');
        throw e;
      });

      // Wait for all three in parallel
      var results = await Promise.all([wsReadyP, workletReadyP, micReadyP]);
      stream = results[2];
      logMsg('✅ All ready in ' + (Date.now() - setupT0) + 'ms (' + audioCtx.sampleRate + 'Hz)');

      if (cancelled) { closeWs(); return; }

      var source = audioCtx.createMediaStreamSource(stream);

      // 6. AnalyserNode for volume metering (same pattern as batch STT)
      var analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT;
      analyser.smoothingTimeConstant = SMOOTHING;
      source.connect(analyser);

      // Volume meter + silence detection loop
      var rafId = null;
      var meterBuf = new Uint8Array(analyser.frequencyBinCount);
      var MIN_SPEECH_MS = 200;
      var SILENCE_MS = 650;
      var speechStartT = 0;
      var silenceStartT = 0;
      function meterTick() {
        if (stopped) return;
        analyser.getByteTimeDomainData(meterBuf);
        var sum = 0;
        for (var i = 0; i < meterBuf.length; i++) { var v = meterBuf[i] - 128; sum += v * v; }
        var rms = Math.sqrt(sum / meterBuf.length);
        var now = Date.now();
        if (!speechDetected && rms > SPEECH_THRESH) {
          speechDetected = true;
          speechStartT = now;
          silenceStartT = 0;
          logMsg('🗣 Speech detected (RMS: ' + rms.toFixed(1) + ')');
        }
        // Silence detection: after MIN_SPEECH_MS of speech, detect SILENCE_MS of quiet
        if (speechDetected) {
          if (rms < SILENCE_THRESH) {
            if (!silenceStartT) silenceStartT = now;
            var speechDur = silenceStartT - speechStartT;
            var silenceDur = now - silenceStartT;
            if (speechDur >= MIN_SPEECH_MS && silenceDur >= SILENCE_MS) {
              logMsg('🤫 Silence detected (' + silenceDur + 'ms after ' + speechDur + 'ms speech)');
              // Flush remaining audio from worklet buffer before stopping
              if (workletNode) {
                workletNode.port.postMessage('flush');
              }
              // Brief delay to let flushed audio send over WS, then tell server we're done
              setTimeout(function() {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: 'stop' }));
                }
              }, 50);
              cancelAnimationFrame(rafId);
              // Don't full cleanup yet — keep WS alive for final result
              stopped = true;
              clearTimeout(stopTimer);
              if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
              if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
              return;
            }
          } else {
            silenceStartT = 0;
          }
        }
        if (ctrl.updateMeter) {
          ctrl.updateMeter(
            Math.min(100, rms * METER_SCALE),
            speechDetected ? (rms < SILENCE_THRESH ? '#ff3366' : '#ffe600') : 'rgba(255,255,255,0.15)'
          );
        }
        rafId = requestAnimationFrame(meterTick);
      }
      meterTick();

      // 7. Connect AudioWorklet → stream PCM over WebSocket
      workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
      var bytesSent = 0;
      workletNode.port.onmessage = function(e) {
        if (stopped || cancelled) return;
        if (ws.readyState === 1) {
          ws.send(e.data); // raw Int16 PCM ArrayBuffer
          bytesSent += e.data.byteLength;
        }
      };
      source.connect(workletNode);
      logMsg('▶️ Streaming audio...');

      // 8. Handle WebSocket messages from server
      ws.onmessage = function(e) {
        if (cancelled) return;
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'final') {
            var elapsed = Date.now() - captureT0;
            logMsg('✅ StreamSTT result: "' + msg.transcript + '" (conf: ' + Math.round((msg.confidence || 0) * 100) + '%, elapsed: ' + elapsed + 'ms)');
            cancelAnimationFrame(rafId);
            cleanup();
            closeWs();
            resolve({
              transcript: msg.transcript || '',
              alternatives: msg.alternatives || [],
              confidence: msg.confidence || 0,
              timing: {
                captureMs: elapsed,
                packMs: 0,
                apiMs: elapsed // streaming — no clear separation
              }
            });
          } else if (msg.type === 'end_of_utterance') {
            logMsg('🤫 End of utterance (Google detected silence)');
            // Stop sending audio, wait for final result
            cancelAnimationFrame(rafId);
            cleanup();
          } else if (msg.type === 'error') {
            logMsg('❌ Server error: ' + msg.message);
            cancelAnimationFrame(rafId);
            cleanup();
            closeWs();
            reject(new Error(msg.message || 'stt-streaming-error'));
          }
        } catch(parseErr) {
          logMsg('❌ Bad server message: ' + parseErr.message);
        }
      };

      ws.onclose = function(e) {
        if (!stopped && !cancelled) {
          logMsg('🔌 WebSocket closed (code: ' + e.code + ')');
          // If we haven't resolved yet, this is an error
          cancelAnimationFrame(rafId);
          cleanup();
          reject(new Error('ws-closed-unexpectedly'));
        }
      };

      ws.onerror = function() {
        if (!stopped && !cancelled) {
          logMsg('❌ WebSocket error');
          cancelAnimationFrame(rafId);
          cleanup();
          reject(new Error('ws-error'));
        }
      };

      // 9. Hard timeout safety net
      stopTimer = setTimeout(function() {
        if (!stopped && !cancelled) {
          logMsg('⏰ Hard cap (' + MAX_MS + 'ms)');
          if (workletNode) {
            workletNode.port.postMessage('flush');
          }
          setTimeout(function() {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'stop' }));
            }
          }, 50);
          // Don't cleanup yet — wait for final result from server (up to 2s)
          setTimeout(function() {
            if (!stopped) {
              logMsg('⏰ No final result after stop — timing out');
              cancelAnimationFrame(rafId);
              cleanup();
              closeWs();
              reject(new Error('no-speech'));
            }
          }, 2000);
        }
      }, MAX_MS);

      // 10. ctrl.stop — user taps to stop
      ctrl.stop = function() {
        if (stopped) return;
        logMsg('⏹ Stop: manual');
        // Flush remaining audio from worklet
        if (workletNode) {
          workletNode.port.postMessage('flush');
        }
        setTimeout(function() {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'stop' }));
          }
        }, 50);
        cancelAnimationFrame(rafId);
        stopped = true;
        clearTimeout(stopTimer);
        if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); stream = null; }
        if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch(e) {} audioCtx = null; }
        // Don't close WS — wait for final result
      };

      ctrl.cancel = function() {
        if (cancelled) return;
        cancelled = true;
        logMsg('↩ Cancelled');
        cancelAnimationFrame(rafId);
        cleanup();
        closeWs();
      };

    } catch(e) {
      cleanup();
      closeWs();
      if (e.message === 'mic-denied' || e.message === 'not-signed-in' || e.message === 'audio-context-suspended') {
        reject(e);
      } else if (e.message && e.message.startsWith('ws-')) {
        logMsg('❌ WebSocket: ' + e.message);
        reject(new Error('stt-network-error'));
      } else {
        logMsg('❌ Streaming setup: ' + e.message);
        reject(new Error('stt-streaming-error'));
      }
    }
  });

  promise.ctrl = ctrl;
  return promise;
}
