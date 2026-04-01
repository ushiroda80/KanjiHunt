// ============================================
// SPEECH-TO-TEXT — plain JS, no JSX/React
// Kept as plain .js (not .jsx) for Safari mobile performance.
// Exact v2.62 architecture preserved — do not restructure.
// ============================================

import { firebaseAuth, CF_URLS, getAuthToken } from '../config/firebase.js';

// Pre-create Worker URL at module load (once, reused across all captures)
// Exact v2.62 approach: inline worker code as string → Blob URL (in-memory, no HTTP fetch).
// Vite's default `new URL()` pattern inlines as data: URL which has null origin → CORS failure.
// File-path approach (`public/stt-worker.js`) fixed CORS but showed 2s arrayBuffer() stalls
// that didn't occur with Blob URL in kanji-hunt.html. Restoring Blob URL to match v2.62 exactly.
const sttWorkerCode = 'self.onmessage=async function(e){var t0=Date.now(),d=e.data,cb=d.chunkBuffers,token=d.authToken,cfUrl=d.cfUrl,ln=d.lang,mt=d.mimeType;try{var tl=0;for(var i=0;i<cb.length;i++)tl+=cb[i].byteLength;var m=new Uint8Array(tl),o=0;for(var i=0;i<cb.length;i++){m.set(new Uint8Array(cb[i]),o);o+=cb[i].byteLength}var C=8192,b="";for(var i=0;i<m.length;i+=C)b+=String.fromCharCode.apply(null,m.subarray(i,i+C));var b64=btoa(b),b64Ms=Date.now()-t0;var ft0=Date.now(),r=await fetch(cfUrl,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({audioBase64:b64,lang:ln,mimeType:mt})});if(!r.ok){self.postMessage({error:"stt-api-error"});return}var data=await r.json(),fMs=Date.now()-ft0,tMs=Date.now()-t0;var tr=data.transcript||"",al=data.alternatives||[],co=data.confidence||0;self.postMessage({ok:true,transcript:tr,alternatives:al,confidence:co,b64Ms:b64Ms,fetchMs:fMs,totalMs:tMs})}catch(err){self.postMessage({error:"stt-network-error"})}};';
const sttWorkerUrl = URL.createObjectURL(new Blob([sttWorkerCode], { type: 'application/javascript' }));

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
  var rafId = null, chunks = [], speechDetected = false, speechT0 = 0, silenceT0 = 0, captureT0 = 0, stopTimer = null, stopCalledAt = 0;
  var ctrl = { stop: null, cancel: null, updateMeter: null, log: null };
  var logMsg = function(msg) { if (ctrl.log) ctrl.log(msg); };

  var stopRecording = function(reason) {
    if (!recording) return;
    logMsg('⏹ Stop: ' + reason);
    recording = false;
    clearTimeout(stopTimer);
    if (rafId) cancelAnimationFrame(rafId);
    // Early cleanup: free Safari resources BEFORE recorder.stop() triggers onstop,
    // so arrayBuffer() on late chunks has less contention
    if (analyser) { analyser.disconnect(); }
    if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    stopCalledAt = Date.now();
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
    var workerT0 = Date.now();
    var worker = new Worker(sttWorkerUrl);
    logMsg('🔧 Worker created at recording start (' + (Date.now() - workerT0) + 'ms)');

    // Per-chunk timing: track when each chunk arrives and when its arrayBuffer() resolves
    var chunkArrivedAt = [];
    var chunkResolvedAt = [];
    var chunkAbMs = [];

    recorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) {
        var idx = chunks.length;
        var arrivedAt = Date.now() - captureT0;
        chunks.push(e.data);
        chunkArrivedAt[idx] = arrivedAt;
        // Pre-convert to ArrayBuffer during recording (while main thread is idle)
        var abT0 = Date.now();
        chunkPromises.push(e.data.arrayBuffer().then(function(ab) {
          chunkBuffers[idx] = ab;
          chunkResolvedAt[idx] = Date.now() - captureT0;
          chunkAbMs[idx] = Date.now() - abT0;
          return ab;
        }));
        logMsg('📦 Chunk ' + idx + ': arrived at ' + arrivedAt + 'ms, ' + e.data.size + 'b');
      }
    };

    captureT0 = Date.now();
    recorder.onstop = async function() {
      var onstopT0 = Date.now();
      var stopToOnstop = stopCalledAt ? (onstopT0 - stopCalledAt) : -1;
      // Cleanup already done in stopRecording() — these are safety nets (idempotent)
      clearTimeout(stopTimer);
      recording = false;
      if (cancelled) { logMsg('↩ onstop: cancelled (user switched to manual)'); worker.terminate(); return; }
      if (chunks.length === 0) { worker.terminate(); return reject(new Error('no-audio')); }
      var recMs = Date.now() - captureT0;
      var totalSize = chunks.reduce(function(s, c) { return s + c.size; }, 0);
      var cleanupMs = Date.now() - onstopT0;
      logMsg('🔴 Stopped. ' + totalSize + 'b, ' + recMs + 'ms, ' + chunks.length + ' chunks, ' + chunkBuffers.filter(Boolean).length + ' pre-converted (cleanup: ' + cleanupMs + 'ms)');
      logMsg('🔴 Stop→onstop gap: ' + stopToOnstop + 'ms');
      var pipelineT0 = Date.now();
      try {
        await Promise.all(chunkPromises);
        var abWaitReal = Date.now() - pipelineT0;
        var readyBuffers = chunkBuffers.filter(Boolean);
        // Log per-chunk ab timing
        for (var ci = 0; ci < chunks.length; ci++) {
          logMsg('📦 Chunk ' + ci + ': arrived=' + (chunkArrivedAt[ci] || '?') + 'ms, ab resolved=' + (chunkResolvedAt[ci] || '?') + 'ms, ab took=' + (chunkAbMs[ci] || '?') + 'ms');
        }
        logMsg('⏱ AB wait: ' + abWaitReal + 'ms (' + readyBuffers.length + '/' + chunks.length + ' ready)');
        // Get auth token on main thread (needs Firebase SDK), then hand off to Worker
        var tokenT0 = Date.now();
        var token = await getAuthToken();
        var tokenMs = Date.now() - tokenT0;
        logMsg('🔑 Auth token: ' + tokenMs + 'ms');
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
