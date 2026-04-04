// AudioWorklet processor: captures raw PCM audio, downsamples to 16kHz Int16
// Runs in a separate audio thread — no imports allowed

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetRate = 16000;
    // sampleRate is a global in AudioWorkletGlobalScope
    this._ratio = sampleRate / this._targetRate;
    this._resampleIndex = 0;
    // Buffer ~200ms of 16kHz audio (3200 samples) before posting
    this._bufferSize = 3200;
    // Listen for flush command to send remaining buffer
    this.port.onmessage = (e) => {
      if (e.data === 'flush' && this._buffer.length > 0) {
        const int16 = new Int16Array(this._buffer);
        this.port.postMessage(int16.buffer, [int16.buffer]);
        this._buffer = [];
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono, Float32, 128 samples at native rate

    // Downsample from native rate to 16kHz via linear interpolation
    while (this._resampleIndex < channelData.length) {
      const idx = this._resampleIndex;
      const low = Math.floor(idx);
      const high = Math.min(low + 1, channelData.length - 1);
      const frac = idx - low;
      const sample = channelData[low] + frac * (channelData[high] - channelData[low]);

      // Float32 [-1,1] → Int16 [-32768,32767]
      const clamped = Math.max(-1, Math.min(1, sample));
      this._buffer.push(clamped * 0x7FFF);

      this._resampleIndex += this._ratio;
    }
    this._resampleIndex -= channelData.length;

    // Post buffer when we have enough samples (~200ms)
    if (this._buffer.length >= this._bufferSize) {
      const int16 = new Int16Array(this._buffer);
      this.port.postMessage(int16.buffer, [int16.buffer]);
      this._buffer = [];
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
