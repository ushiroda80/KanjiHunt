// STT Web Worker — runs off main thread
// Exact v2.62 architecture: receive pre-converted ArrayBuffers, b64 encode, fetch Cloud Function
// Only change from original: Cloud Function URL + auth token instead of Google API key directly

self.onmessage = async function(e) {
  var t0 = Date.now();
  var d = e.data;
  var cb = d.chunkBuffers;
  var token = d.authToken;
  var cfUrl = d.cfUrl;
  var ln = d.lang;
  var mt = d.mimeType;

  try {
    // Merge all chunk ArrayBuffers into a single Uint8Array
    var tl = 0;
    for (var i = 0; i < cb.length; i++) tl += cb[i].byteLength;
    var m = new Uint8Array(tl);
    var o = 0;
    for (var i = 0; i < cb.length; i++) {
      m.set(new Uint8Array(cb[i]), o);
      o += cb[i].byteLength;
    }

    // Base64 encode in 8192-byte chunks
    var C = 8192;
    var b = '';
    for (var i = 0; i < m.length; i += C) {
      b += String.fromCharCode.apply(null, m.subarray(i, i + C));
    }
    var b64 = btoa(b);
    var b64Ms = Date.now() - t0;

    // Fetch Cloud Function with Bearer auth
    var ft0 = Date.now();
    var r = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ audioBase64: b64, lang: ln, mimeType: mt })
    });

    if (!r.ok) {
      self.postMessage({ error: 'stt-api-error' });
      return;
    }

    var data = await r.json();
    var fMs = Date.now() - ft0;
    var tMs = Date.now() - t0;

    var tr = data.transcript || '';
    var al = data.alternatives || [];
    var co = data.confidence || 0;

    self.postMessage({ ok: true, transcript: tr, alternatives: al, confidence: co, b64Ms: b64Ms, fetchMs: fMs, totalMs: tMs });
  } catch(err) {
    self.postMessage({ error: 'stt-network-error' });
  }
};
