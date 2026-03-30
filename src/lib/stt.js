// ============================================
// SPEECH-TO-TEXT — plain JS, no JSX/React
// Kept as plain .js (not .jsx) for Safari mobile performance.
// Exact v2.62 architecture preserved — do not restructure.
// ============================================

import { firebaseAuth, CF_URLS, getAuthToken } from '../config/firebase.js';

// Pre-create Worker URL at module load (once, reused across all captures)
// Worker lives in public/ so it's served as a separate file (same origin).
// Vite's default inlines workers as data: URLs which have null origin → CORS failure.
const sttWorkerUrl = import.meta.env.BASE_URL + 'stt-worker.js';

// Determine best available speech input method
// No parameters — checks firebaseAuth.currentUser
export function getSpeechMethod() {
  var user = firebaseAuth.currentUser;
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return (typeof MediaRecorder !== 'undefined' && !!user) ? 'cloudSTT' : 'manual';
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) return 'webSpeech';
  if (typeof MediaRecorder !== 'undefined' && !!user) return 'cloudSTT';
  return 'manual';
}

// Google Cloud Speech-to-Text with silence detection
// Exact v2.62 architecture: pre-convert chunks during recording, Worker at recording start
export function recognizeWithCloudSTT(lang) {
  lang = lang || 'ja-JP';
  var SPEECH_THRESH = 4, SILENCE_THRESH = 2, SILENCE_MS = 650, MIN_SPEECH_MS = 200;
  var MAX_MS = 5500, SMOOTHING = 0.1, FFT = 512, METER_SCALE = 8;
  var recording = false, cancelled = false, stream = null, recorder = null, audioCtx = null, analyser = null;
  var rafId = null, chunks = [], speechDetected = false, speechT0 = 0, silenceT0 = 0, captureT0 = 0, stopTimer = null;
  var ctrl = { stop: null, cancel: null, updateMeter: null, log: null };
  var logMsg = function(msg) { if (ctrl.log) ctrl.log(msg); };

  var stopRecording = function(reason) {
    if (!recording) return;
    logMsg('⏹ Stop: ' + reason);
    recording = false;
    clearTimeout(stopTimer);
    if (rafId) cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  var monitorLoop = function() {
    var buf = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      if (!recording) return;
      analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) { var v = buf[i] - 128; sum += v * v; }
      var rms = Math.sqrt(sum / buf.length);
      var now = Date.now();
      var elapsed = now - captureT0;
      if (ctrl.updateMeter) ctrl.updateMeter(Math.min(100, rms * METER_SCALE), speechDetected ? (rms < SILENCE_THRESH ? '#ff3366' : '#ffe600') : 'rgba(255,255,255,0.15)');
      if (!speechDetected) {
        if (rms > SPEECH_THRESH) { speechDetected = true; speechT0 = now; silenceT0 = 0; logMsg('🗣 Speech at ' + elapsed + 'ms (RMS: ' + rms.toFixed(1) + ')'); }
      } else {
        if (rms < SILENCE_THRESH) {
          if (!silenceT0) { silenceT0 = now; logMsg('🤫 Silence at ' + elapsed + 'ms (RMS: ' + rms.toFixed(1) + ')'); }
          var speechDur = (silenceT0 || now) - speechT0, silDur = now - silenceT0;
          if (silenceT0 && silDur >= SILENCE_MS && speechDur >= MIN_SPEECH_MS) { logMsg('✂️ Auto-stop: ' + silDur + 'ms silence, ' + speechDur + 'ms speech'); stopRecording('silence'); return; }
        } else { if (silenceT0) logMsg('🗣 Resumed after ' + (now - silenceT0) + 'ms'); silenceT0 = 0; }
      }
      rafId = requestAnimationFrame(tick);
    }
    tick();
  };

  var promise = new Promise(async function(resolve, reject) {
    var user = firebaseAuth.currentUser;
    if (!user) return reject(new Error('not-signed-in'));
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return reject(new Error('mic-denied')); }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    logMsg('🔊 AudioCtx: ' + audioCtx.state + ', ' + audioCtx.sampleRate + 'Hz');
    var source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = SMOOTHING;
    source.connect(analyser);
    var mimeType = 'audio/webm';
    var formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/wav'];
    for (var f = 0; f < formats.length; f++) { if (MediaRecorder.isTypeSupported(formats[f])) { mimeType = formats[f]; break; } }
    recorder = new MediaRecorder(stream, { mimeType: mimeType });
    var chunkBuffers = [];
    var chunkPromises = [];

    // Create Worker at recording start (warm, not stale) — v2.62 architecture
    var worker = new Worker(sttWorkerUrl);
    logMsg('🔧 Worker created at recording start');

    recorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) {
        var idx = chunks.length;
        chunks.push(e.data);
        // Pre-convert to ArrayBuffer during recording (while main thread is idle)
        chunkPromises.push(e.data.arrayBuffer().then(function(ab) { chunkBuffers[idx] = ab; return ab; }));
      }
    };

    captureT0 = Date.now();
    recorder.onstop = async function() {
      var onstopT0 = Date.now();
      stream.getTracks().forEach(function(t) { t.stop(); });
      cancelAnimationFrame(rafId);
      if (audioCtx) { audioCtx.close(); audioCtx = null; }
      clearTimeout(stopTimer);
      recording = false;
      if (cancelled) { logMsg('↩ onstop: cancelled (user switched to manual)'); worker.terminate(); return; }
      if (chunks.length === 0) { worker.terminate(); return reject(new Error('no-audio')); }
      var recMs = Date.now() - captureT0;
      var totalSize = chunks.reduce(function(s, c) { return s + c.size; }, 0);
      var cleanupMs = Date.now() - onstopT0;
      logMsg('🔴 Stopped. ' + totalSize + 'b, ' + recMs + 'ms, ' + chunks.length + ' chunks, ' + chunkBuffers.filter(Boolean).length + ' pre-converted (cleanup: ' + cleanupMs + 'ms)');
      var pipelineT0 = Date.now();
      try {
        await Promise.all(chunkPromises);
        var abWaitReal = Date.now() - pipelineT0;
        var readyBuffers = chunkBuffers.filter(Boolean);
        logMsg('⏱ AB wait: ' + abWaitReal + 'ms (' + readyBuffers.length + '/' + chunks.length + ' ready)');
        // Get auth token on main thread (needs Firebase SDK), then hand off to Worker
        var token = await getAuthToken();
        var postT0 = Date.now();
        var result = await new Promise(function(res, rej) {
          worker.onmessage = function(e) { res(e.data); worker.terminate(); };
          worker.onerror = function(err) { rej(new Error('worker-error')); worker.terminate(); };
          worker.postMessage({ chunkBuffers: readyBuffers, authToken: token, cfUrl: CF_URLS.recognizeSpeech, lang: lang, mimeType: mimeType }, readyBuffers);
        });
        var pipelineMs = Date.now() - pipelineT0;
        var postMs = Date.now() - postT0;
        if (result.error) { logMsg('❌ Worker: ' + result.error); return reject(new Error(result.error)); }
        logMsg('⏱ Worker: b64=' + result.b64Ms + 'ms, api=' + result.fetchMs + 'ms, total=' + result.totalMs + 'ms | Post: ' + postMs + 'ms | Pipeline: ' + pipelineMs + 'ms');
        resolve({ transcript: result.transcript, alternatives: result.alternatives, confidence: result.confidence, timing: { captureMs: recMs, onstopMs: cleanupMs, packMs: pipelineMs - result.fetchMs, apiMs: result.fetchMs } });
      } catch(e) { logMsg('❌ Pipeline: ' + e.message); reject(new Error('stt-network-error')); }
    };

    recorder.start(1000);
    recording = true;
    logMsg('▶️ Recording');
    stopTimer = setTimeout(function() { if (recording) { logMsg('⏰ Hard cap'); stopRecording('timeout'); } }, MAX_MS);
    monitorLoop();
    ctrl.stop = function() { stopRecording('manual'); };
    ctrl.cancel = function() { cancelled = true; stopRecording('cancelled'); };
  });

  promise.ctrl = ctrl;
  return promise;
}
