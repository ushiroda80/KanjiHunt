import React, { useState, useEffect, useRef, useCallback } from 'react';
import { firebaseAuth } from '../../config/firebase';
import { getSpeechMethod, recognizeWithCloudSTT } from '../../lib/stt';
import { recognizeWithStreamingSTT } from '../../lib/stt-streaming';
import { getStoredDefaultLang, setStoredDefaultLang, incLifetimeCaptures, getStreamingSTTEnabled } from '../../lib/storage';
import { resolveEnglishToJapanese } from '../../lib/api';
import VoiceTipModal from '../VoiceTipModal';

// Track whether user has interacted with the page. iOS Safari requires a user
// gesture for getUserMedia() and AudioContext.resume(). Module-level so it
// persists across React remounts (tab switches) within the same page session.
let hasUserGesture = false;
const markGesture = () => { hasUserGesture = true; };
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', markGesture, { once: true });
  window.addEventListener('click', markGesture, { once: true });
}

const CapturePage = ({ onCapture, defaultLang, usage, isAdmin }) => {
  const speechMethod = getSpeechMethod();

  const [status, setStatus] = useState(() => speechMethod !== 'manual' ? 'listening' : 'manual');
  const [errorMessage, setErrorMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(7);
  const [transcript, setTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [captureLang, setCaptureLang] = useState(() => getStoredDefaultLang());
  const [resolving, setResolving] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [editValue, setEditValue] = useState('');
  const [alternatives, setAlternatives] = useState([]);
  const [editReading, setEditReading] = useState('');
  const [captureConfidence, setCaptureConfidence] = useState(0);
  const [showTipModal, setShowTipModal] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const recStartTimeRef = useRef(0);
  const hadInterimRef = useRef(false);
  const volumeBarRef = useRef(null);

  const capLog = useCallback((msg, level = 'info') => {
    const elapsed = recStartTimeRef.current ? Date.now() - recStartTimeRef.current : 0;
    const ts = recStartTimeRef.current ? `${elapsed}ms` : '—';
    const entry = { ts, msg, level, time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    setDebugLog(prev => [...prev.slice(-30), entry]);
    console.log(`[CAP ${ts}] ${msg}`);
  }, []);

  const gotFinalRef = useRef(false);
  const lastInterimRef = useRef('');
  const [listeningReady, setListeningReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const handleTipDismiss = useCallback(() => { setShowTipModal(false); }, []);

  const miniDict = useRef({
    '木': 'tree', '目': 'eye', '手': 'hand', '日': 'day', '火': 'fire', '水': 'water',
    '金': 'gold', '土': 'earth', '月': 'moon', '花': 'flower', '雨': 'rain', '風': 'wind',
    '空': 'sky', '海': 'sea', '山': 'mountain', '川': 'river', '石': 'stone', '星': 'star',
    '犬': 'dog', '猫': 'cat', '鳥': 'bird', '魚': 'fish', '馬': 'horse', '虫': 'bug',
    '赤': 'red', '青': 'blue', '白': 'white', '黒': 'black', '大': 'big', '小': 'small',
    '新しい': 'new', '古い': 'old', '高い': 'tall', '安い': 'cheap', '長い': 'long',
    '食べる': 'eat', '飲む': 'drink', '行く': 'go', '来る': 'come', '見る': 'see',
    '聞く': 'hear', '話す': 'speak', '書く': 'write', '読む': 'read', '走る': 'run',
    '歩く': 'walk', '泳ぐ': 'swim', '飛ぶ': 'fly', '買う': 'buy', '売る': 'sell',
    '今日': 'today', '明日': 'tomorrow', '昨日': 'yesterday', '今': 'now', '前': 'before',
    '後': 'after', '上': 'above', '下': 'below', '中': 'inside', '外': 'outside',
    '右': 'right', '左': 'left', '北': 'north', '南': 'south', '東': 'east', '西': 'west',
    '人': 'person', '男': 'man', '女': 'woman', '子': 'child', '友達': 'friend',
    '家': 'house', '車': 'car', '電車': 'train', '道': 'road', '駅': 'station',
    '学校': 'school', '仕事': 'work', '時間': 'time', '天気': 'weather', '元気': 'energy',
    '好き': 'like', '嫌い': 'dislike', '欲しい': 'want', '怖い': 'scary',
    'お金': 'money', '名前': 'name', '言葉': 'word', '意味': 'meaning',
    '朝': 'morning', '昼': 'noon', '夜': 'night', '春': 'spring', '夏': 'summer',
    '秋': 'autumn', '冬': 'winter', '雪': 'snow', '雲': 'cloud', '光': 'light',
    '音': 'sound', '色': 'color', '力': 'power', '心': 'heart', '体': 'body',
    '頭': 'head', '顔': 'face', '口': 'mouth', '耳': 'ear', '鼻': 'nose',
    '食べ物': 'food', '飲み物': 'drink', '果物': 'fruit', '野菜': 'vegetable',
    '肉': 'meat', '米': 'rice', '茶': 'tea', '酒': 'sake', '塩': 'salt',
    '砂糖': 'sugar', '紙': 'paper', '本': 'book', '映画': 'movie', '音楽': 'music',
    '勉強': 'study', '練習': 'practice', '旅行': 'travel', '散歩': 'stroll',
    '問題': 'problem', '答え': 'answer', '質問': 'question', '簡単': 'easy',
    '難しい': 'difficult', '危ない': 'dangerous', '楽しい': 'fun', '嬉しい': 'happy',
    '悲しい': 'sad', '優しい': 'kind', '強い': 'strong', '弱い': 'weak',
    '早い': 'early', '遅い': 'late', '近い': 'near', '遠い': 'far',
    '多い': 'many', '少ない': 'few', '暑い': 'hot', '寒い': 'cold',
    '美味しい': 'delicious', '不味い': 'bad taste', '綺麗': 'beautiful', '可愛い': 'cute',
    '投資': 'investment', '経済': 'economy', '予測': 'forecast', '連続': 'continuous',
    '最適': 'optimal', '冒険': 'adventure', '財務': 'finance',
  }).current;
  const hiraganaDict = useRef({
    'き': 'tree', 'め': 'eye', 'て': 'hand', 'ひ': 'fire',
    'みず': 'water', 'かね': 'gold', 'つち': 'earth', 'つき': 'moon',
    'はな': 'flower', 'あめ': 'rain', 'かぜ': 'wind', 'そら': 'sky',
    'うみ': 'sea', 'やま': 'mountain', 'かわ': 'river', 'いし': 'stone',
    'ほし': 'star', 'いぬ': 'dog', 'ねこ': 'cat', 'とり': 'bird',
    'さかな': 'fish', 'うま': 'horse', 'むし': 'bug', 'あか': 'red',
    'あお': 'blue', 'しろ': 'white', 'くろ': 'black',
    'たべる': 'eat', 'のむ': 'drink', 'いく': 'go', 'くる': 'come', 'みる': 'see',
    'きく': 'hear', 'はなす': 'speak', 'かく': 'write', 'よむ': 'read',
    'きょう': 'today', 'あした': 'tomorrow', 'きのう': 'yesterday', 'いま': 'now',
    'ひと': 'person', 'いえ': 'house', 'くるま': 'car', 'みち': 'road', 'えき': 'station',
    'しごと': 'work', 'じかん': 'time', 'てんき': 'weather', 'げんき': 'energy',
    'すき': 'like', 'おかね': 'money', 'なまえ': 'name', 'ことば': 'word', 'いみ': 'meaning',
    'あさ': 'morning', 'ひる': 'noon', 'よる': 'night', 'はる': 'spring',
    'なつ': 'summer', 'あき': 'autumn', 'ふゆ': 'winter', 'ゆき': 'snow',
    'くも': 'cloud', 'おと': 'sound', 'いろ': 'color',
    'こころ': 'heart', 'からだ': 'body', 'あたま': 'head', 'かお': 'face',
    'ほん': 'book', 'えいが': 'movie', 'おんがく': 'music',
    'べんきょう': 'study', 'りょこう': 'travel', 'さんぽ': 'stroll',
    'もんだい': 'problem', 'こたえ': 'answer', 'かんたん': 'easy',
    'たのしい': 'fun', 'うれしい': 'happy', 'かなしい': 'sad',
    'おいしい': 'delicious', 'かわいい': 'cute',
    'とうし': 'investment', 'けいざい': 'economy', 'よそく': 'forecast',
  }).current;
  const lookupDef = useCallback((word) => miniDict[word] || hiraganaDict[word] || '', []);

  const langRef = useRef(captureLang);
  langRef.current = captureLang;
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const activeRecRef = useRef(null);
  const activeTimersRef = useRef({ timeout: null, countdown: null });
  const captureGenRef = useRef(0);

  const isJaMode = captureLang === 'ja';

  const stopCurrentRecognition = () => {
    try { if (activeRecRef.current) activeRecRef.current.abort(); } catch(e) {}
    activeRecRef.current = null;
    if (activeTimersRef.current.timeout) clearTimeout(activeTimersRef.current.timeout);
    if (activeTimersRef.current.countdown) clearInterval(activeTimersRef.current.countdown);
  };

  const handleRecordingResult = useCallback((result) => {
    const { transcript: text, alternatives: alts, language: lang, reading, confidence } = result;

    capLog(`📋 Pipeline: result received — "${text}" (${lang}, ${alts.length} alts, conf: ${Math.round((confidence || 0) * 100)}%)`);

    if (!text) {
      setStatus('error');
      setErrorMessage("No speech detected");
      return;
    }

    if (confidence >= 0.75) {
      capLog(`⚡ Auto-confirm (${Math.round(confidence * 100)}% >= 75%)`);
      setTranscript(text);
      setCaptureConfidence(confidence);
      handleResolvedSubmit(text, lang);
      return;
    }

    setTranscript(text);
    setAlternatives(alts);
    setEditValue(text);
    setEditReading(reading || '');
    setCaptureConfidence(confidence || 0);
    setStatus('editing');
  }, []);

  const handleResolvedSubmit = useCallback((text, lang) => {
    capLog(`📋 Pipeline: submit — "${text}" (${lang})`);
    setTranscript(text);

    if (lang === 'ja') {
      onCaptureRef.current(text, undefined, { inputLang: 'ja' });
    } else {
      setStatus('success');
      setResolving(true);
      handleEnglishResolve(text);
    }
  }, []);

  const extractReading = (text, alternatives, lang) => {
    if (lang !== 'ja') return '';
    const isAllKana = (s) => /^[\u3040-\u309f\u30a0-\u30ff\u30fc]+$/.test(s);
    const hasKanji = /[\u4e00-\u9faf\u3400-\u4dbf]/.test(text);
    if (!hasKanji) return '';
    for (const alt of alternatives) {
      const altText = (alt.transcript || alt).toString().replace(/\s+/g, '');
      if (isAllKana(altText) && altText !== text) return altText;
    }
    return '';
  };

  const startListening = useCallback(() => {
    stopCurrentRecognition();
    captureGenRef.current++;
    const thisGen = captureGenRef.current;
    setStatus('listening');
    setErrorMessage('');
    setTimeLeft(7);
    setTranscript('');
    setEditValue('');
    setAlternatives([]);
    setResolving(false);

    setListeningReady(false);
    activeTimersRef.current.prep = setTimeout(() => { setListeningReady(true); }, 250);

    const currentLang = langRef.current;
    const recognizerLang = currentLang === 'ja' ? 'ja-JP' : 'en-US';

    const countdownId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(countdownId); return 0; }
        return prev - 1;
      });
    }, 1000);
    activeTimersRef.current.countdown = countdownId;

    // ===== Cloud STT path =====
    if (getSpeechMethod() === 'cloudSTT') {
      if (!firebaseAuth.currentUser) {
        clearInterval(countdownId);
        setStatus('manual');
        setErrorMessage("Sign in required for voice capture on this device. Type instead:");
        capLog('📱 iOS/non-Chrome detected, not signed in → manual mode', 'warn');
        return;
      }

      const useStreaming = getStreamingSTTEnabled() && typeof AudioWorklet !== 'undefined';
      capLog(`📱 Using ${useStreaming ? 'Streaming' : 'Batch'} STT (${recognizerLang})`);
      recStartTimeRef.current = Date.now();
      gotFinalRef.current = false;

      const sttPromise = useStreaming
        ? recognizeWithStreamingSTT(recognizerLang)
        : recognizeWithCloudSTT(recognizerLang);
      activeRecRef.current = { stop: () => sttPromise.ctrl?.stop?.(), abort: () => sttPromise.ctrl?.cancel?.(), ctrl: sttPromise.ctrl };

      sttPromise.ctrl.updateMeter = (pct, color) => {
        const el = volumeBarRef.current;
        if (el) { el.style.width = pct + '%'; el.style.background = color; }
      };
      sttPromise.ctrl.log = (msg) => capLog(msg);

      sttPromise.then(result => {
        clearInterval(countdownId);
        if (captureGenRef.current !== thisGen) { capLog('↩ Stale CloudSTT result discarded (gen ' + thisGen + ' vs ' + captureGenRef.current + ')'); return; }
        if (gotFinalRef.current) { capLog('↩ CloudSTT result discarded (user switched to manual)'); return; }
        const elapsed = Date.now() - recStartTimeRef.current;
        capLog(`✅ CloudSTT result: "${result.transcript}" (${result.alternatives.length} alts, conf: ${Math.round(result.confidence * 100)}%, elapsed: ${elapsed}ms)`);

        if (result.timing) {
          const t = result.timing;
          const displayStart = Date.now();
          if (t.streaming) {
            // Streaming logs its own 📊 summary from stt-streaming.js
            // Just track display timing here
          } else {
            const total = elapsed;
            capLog(`📊 CAPTURE SUMMARY — Total: ${total}ms`);
            capLog(`   🎙 Capture: ${t.captureMs}ms (mic init → silence end)`);
            capLog(`   📦 Package: ${t.packMs}ms (audio encode → send to Google)`);
            capLog(`   🌐 API: ${t.apiMs}ms (Google STT round-trip)`);
          }
          recStartTimeRef.current = displayStart;
          capLog(`   🖥 Display: (pending render...)`);
        }

        const text = currentLang === 'ja' ? (result.transcript || '').replace(/\s+/g, '') : (result.transcript || '');
        const reading = extractReading(text, result.alternatives, currentLang);

        handleRecordingResult({
          transcript: text,
          alternatives: result.alternatives,
          language: currentLang,
          reading,
          confidence: result.confidence
        });
      }).catch(err => {
        clearInterval(countdownId);
        if (captureGenRef.current !== thisGen) { capLog('↩ Stale CloudSTT error discarded'); return; }
        if (gotFinalRef.current) { capLog('↩ CloudSTT cancelled (intentional)'); return; }
        capLog(`❌ CloudSTT error: ${err.message}`, 'error');
        if (err.message === 'mic-denied') {
          setStatus('manual');
          setErrorMessage("Mic unavailable. Type instead:");
        } else {
          setStatus('error');
          setErrorMessage(err.message === 'stt-api-error' ? "Speech API error — check Google key" : "No speech detected");
        }
      });

      return;
    }

    // ===== Web Speech API path =====
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      clearInterval(countdownId);
      setStatus('manual');
      setErrorMessage("Speech recognition not supported. Type instead:");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = recognizerLang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 5;
    activeRecRef.current = recognition;

    gotFinalRef.current = false;
    lastInterimRef.current = '';
    hadInterimRef.current = false;
    recStartTimeRef.current = Date.now();
    capLog(`🎙 Starting recognition (${recognizerLang})`);

    const timeoutId = setTimeout(() => {
      capLog('⏰ 7s timeout — stopping', 'warn');
      try { recognition.stop(); } catch(e) {}
      clearInterval(countdownId);
      if (!gotFinalRef.current) {
        capLog('❌ No speech detected (timeout)', 'error');
        setStatus('error');
        setErrorMessage("No speech detected");
      }
    }, 7000);
    activeTimersRef.current.timeout = timeoutId;

    recognition.onaudiostart = () => capLog('🔊 Audio stream started');
    recognition.onaudioend = () => capLog('🔇 Audio stream ended');
    recognition.onspeechstart = () => capLog('🗣 Speech detected');
    recognition.onspeechend = () => capLog('🤐 Speech ended');
    recognition.onstart = () => capLog('✅ Recognition started');

    recognition.onresult = (event) => {
      const current = event.results[event.results.length - 1];
      let text = current[0].transcript;
      if (langRef.current === 'ja') text = text.replace(/\s+/g, '');
      const chars = [...text];
      setTranscript(chars.length > 12 ? chars.slice(0, 12).join('') : text);

      if (!current.isFinal) {
        hadInterimRef.current = true;
        capLog(`📝 interim: "${text}"`);
      }

      if (!current.isFinal && langRef.current === 'ja') {
        lastInterimRef.current = text.replace(/\s+/g, '');
      }

      if (current.isFinal) {
        capLog(`✅ FINAL: "${text}" (${current.length} alts, conf: ${Math.round((current[0].confidence || 0) * 100)}%)`);
        gotFinalRef.current = true;
        clearTimeout(timeoutId);
        clearInterval(countdownId);

        const alts = [];
        const altCount = Math.min(current.length, 3);
        for (let i = 0; i < altCount; i++) {
          const altText = langRef.current === 'ja' ? current[i].transcript.replace(/\s+/g, '') : current[i].transcript;
          alts.push({ transcript: altText, confidence: current[i].confidence });
        }

        let reading = '';
        if (langRef.current === 'ja') {
          reading = extractReading(text, alts, 'ja');
          if (!reading) {
            const interim = lastInterimRef.current;
            if (interim && interim !== text) reading = interim;
          }
        }

        handleRecordingResult({
          transcript: text,
          alternatives: alts,
          language: langRef.current,
          reading,
          confidence: current[0].confidence || 0
        });
      }
    };

    recognition.onerror = (event) => {
      capLog(`⚠️ onerror: ${event.error}${event.message ? ' — ' + event.message : ''}`, 'error');
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      if (event.error === 'aborted') { capLog('↩ Ignoring abort (intentional)'); return; }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        capLog('🚫 Mic not allowed → manual mode', 'error');
        setStatus('manual');
        setErrorMessage("Mic unavailable. Type instead:");
      } else {
        capLog(`❌ Error → error state: ${event.error}`, 'error');
        setStatus('error');
        setErrorMessage(event.error === 'no-speech' ? "No speech detected" : `Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      const elapsed = Date.now() - recStartTimeRef.current;
      capLog(`🔚 onend — gotFinal: ${gotFinalRef.current}, hadInterim: ${hadInterimRef.current}, elapsed: ${elapsed}ms`);
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      if (!gotFinalRef.current) {
        capLog('⚠️ Ended without final result → setting error', 'warn');
        setStatus(prev => prev === 'listening' ? 'error' : prev);
        setErrorMessage(prev => prev || "Recognition failed");
      }
    };

    try { recognition.start(); capLog('📡 recognition.start() called'); }
    catch (e) { capLog(`💥 start() threw: ${e.message}`, 'error'); clearInterval(countdownId); setStatus('manual'); setErrorMessage("Mic unavailable. Type instead:"); }
  }, []);

  const lastResolveRef = useRef(null);

  const handleEnglishResolve = async (englishText) => {
    const results = await resolveEnglishToJapanese(englishText);
    setResolving(false);
    lastResolveRef.current = { englishInput: englishText, resolveEnglish: results };

    if (results && results.length > 0) {
      results.forEach(r => { if (r.kanji) r.kanji = r.kanji.trim(); });
      const topResult = results[0];
      const hasRealAlternatives = results.length > 1 &&
        results.some((r, i) => i > 0 && (r.confidence || 0) >= 20);
      const topConfidence = topResult.confidence || 90;

      if (results.length === 1 || topConfidence >= 70 && !hasRealAlternatives) {
        setTranscript(topResult.kanji);
        onCaptureRef.current(topResult.kanji, undefined, { inputLang: 'en', englishInput: englishText, resolveEnglish: results });
      } else {
        setCandidates(results.slice(0, 3));
        setStatus('picking');
      }
    } else {
      onCaptureRef.current(englishText, undefined, { inputLang: 'en', englishInput: englishText, resolveEnglish: null });
    }
  };

  const handlePickCandidate = (candidate) => {
    const ctx = lastResolveRef.current || {};
    setCandidates([]);
    onCaptureRef.current(candidate.kanji, undefined, { inputLang: 'en', englishInput: ctx.englishInput, resolveEnglish: ctx.resolveEnglish });
  };

  const handleEditSubmit = () => {
    if (!editValue.trim()) return;
    const text = editValue.trim();
    capLog(`👆 "Go" clicked: "${text}" (${langRef.current})`);
    handleResolvedSubmit(text, langRef.current);
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    let text = manualInput.trim();
    if (langRef.current === 'ja') text = text.replace(/\s+/g, '');
    capLog(`👆 "Capture" clicked: "${text}" (${langRef.current})`);
    handleResolvedSubmit(text, langRef.current);
  };

  const handleToggleLang = (lang) => {
    if (lang === captureLang) return;
    capLog(`🔀 Lang toggle: ${captureLang} → ${lang}`);
    setCaptureLang(lang);
    setStoredDefaultLang(lang);
    if (status === 'listening') {
      stopCurrentRecognition();
      setStatus('listening');
      setTranscript('');
      setTimeLeft(7);
      setTimeout(() => startListening(), 350);
    }
  };

  useEffect(() => {
    if (speechMethod === 'manual') return;
    if (speechMethod === 'cloudSTT' && !hasUserGesture) {
      // iOS Safari: no user gesture yet — getUserMedia/AudioContext will fail.
      // Show tap-to-start UI. After first tap, hasUserGesture stays true for the session.
      // Web Speech API (Chrome) doesn't need this — it has its own permission prompt.
      setNeedsGesture(true);
      setListeningReady(true);
      return;
    }
    const timer = setTimeout(() => startListening(), 300);
    return () => { clearTimeout(timer); stopCurrentRecognition(); };
  }, []);

  useEffect(() => {
    if (status === 'success') incLifetimeCaptures();
    if (status === 'editing' && recStartTimeRef.current) {
      capLog(`   🖥 Display: ${Date.now() - recStartTimeRef.current}ms (result → screen)`);
    }
  }, [status]);

  const LangToggle = () => (
    <div style={{
      position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: '0',
      background: 'rgba(255,255,255,0.08)', borderRadius: '50px',
      padding: '3px', border: '1px solid rgba(255,255,255,0.12)',
      zIndex: 10
    }}>
      <button
        onClick={() => handleToggleLang('ja')}
        style={{
          padding: '6px 14px', borderRadius: '50px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: '700', transition: 'all 0.15s ease',
          background: isJaMode ? '#ffe600' : 'transparent',
          color: isJaMode ? '#000' : 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', gap: '5px'
        }}
      >
        <span style={{ fontSize: '14px' }}>🇯🇵</span> JA
      </button>
      <button
        onClick={() => handleToggleLang('en')}
        style={{
          padding: '6px 14px', borderRadius: '50px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: '700', transition: 'all 0.15s ease',
          background: !isJaMode ? '#60a5fa' : 'transparent',
          color: !isJaMode ? '#fff' : 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', gap: '5px'
        }}
      >
        <span style={{ fontSize: '14px' }}>🇺🇸</span> EN
      </button>
    </div>
  );

  return (
    <div style={{
      padding: '24px', minHeight: '100vh', position: 'relative',
      background: '#1a1a2e',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s ease'
    }}>
      {status !== 'success' && status !== 'picking' && status !== 'editing' && <LangToggle />}

      {/* Usage badge — top right */}
      {usage && status !== 'success' && status !== 'picking' && status !== 'editing' && (
        <div style={{
          position: 'absolute', top: '24px', right: '20px', zIndex: 10,
          fontSize: '10px', fontWeight: '700',
          padding: '4px 8px', borderRadius: '8px',
          background: usage.used >= usage.limit ? 'rgba(226,75,74,0.2)' : 'rgba(255,255,255,0.08)',
          color: usage.used >= usage.limit ? '#F09595' : 'rgba(255,255,255,0.5)',
          border: '1px solid ' + (usage.used >= usage.limit ? 'rgba(226,75,74,0.3)' : 'rgba(255,255,255,0.08)')
        }}>
          {Math.max(0, usage.limit - usage.used)}
        </div>
      )}

      {/* Rate limit modal overlay */}
      {usage && usage.used >= usage.limit && status === 'listening' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, borderRadius: 0
        }}>
          <div style={{
            background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', padding: '28px 24px', width: '260px', textAlign: 'center'
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(226,75,74,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F09595" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            </div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#fff', margin: '0 0 8px' }}>Limit reached</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.5 }}>
              You've used all {usage.limit} captures this month. Resets {(() => {
                const now = new Date();
                const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                return reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })()}.
            </p>
            <button onClick={() => {}} style={{
              background: '#ffe600', border: 'none', borderRadius: '10px',
              padding: '11px 0', fontSize: '13px', fontWeight: '700',
              color: '#000', cursor: 'pointer', width: '100%', marginBottom: '10px'
            }}>Get more captures</button>
            <button onClick={() => setStatus('manual')} style={{
              background: 'none', border: 'none', fontSize: '12px',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontWeight: '500'
            }}>Dismiss</button>
          </div>
        </div>
      )}

      {status === 'listening' && (
        <>
          <div onClick={() => {
            if (needsGesture) { setNeedsGesture(false); startListening(); }
            else if (speechMethod === 'cloudSTT' && activeRecRef.current) { capLog('👆 Tap to submit'); activeRecRef.current.stop(); }
          }}
            style={{ width: '120px', height: '120px', borderRadius: '50%', background: needsGesture ? 'rgba(255,255,255,0.08)' : (isJaMode ? 'rgba(255,51,102,0.12)' : 'rgba(96,165,250,0.12)'), display: 'flex', alignItems: 'center', justifyContent: 'center', animation: (listeningReady && !needsGesture) ? 'pulse-ring 1.5s ease infinite' : 'none', opacity: listeningReady ? 1 : 0.25, cursor: (speechMethod === 'cloudSTT' || needsGesture) ? 'pointer' : 'default' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: needsGesture ? '#555' : (isJaMode ? '#ff3366' : '#3b82f6'), display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: listeningReady ? 1 : 0.25 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#fff' }}/>
            </div>
          </div>
          <p style={{ marginTop: '28px', fontSize: '18px', fontWeight: '600', color: listeningReady ? '#fff' : 'rgba(255,255,255,0.1)', transition: 'opacity 0.3s' }}>{needsGesture ? 'Tap to start recording' : (speechMethod === 'webSpeech' ? `Listening for ${isJaMode ? 'Japanese' : 'English'}...` : `Recording ${isJaMode ? 'Japanese' : 'English'}...`)}</p>
          <p style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.4)', opacity: listeningReady ? 1 : 0 }}>
            {needsGesture ? 'Tap the mic to begin' : (isJaMode ? 'Say a word in Japanese' : 'Say a word in English')}
          </p>
          {speechMethod === 'cloudSTT' && !needsGesture && (
            <div style={{ marginTop: '16px', width: '160px', height: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', overflow: 'hidden' }}>
              <div ref={volumeBarRef} style={{ height: '100%', borderRadius: '2px', width: '0%', background: 'rgba(255,255,255,0.12)', transition: 'width 0.06s' }}/>
            </div>
          )}
          {transcript && <p style={{ marginTop: '24px', fontSize: '32px', fontWeight: '800', color: '#ffe600' }}>{transcript}</p>}
          {!needsGesture && <p style={{ marginTop: '16px', fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>{timeLeft}s</p>}
          <button onClick={() => { capLog('👆 "Type instead" clicked'); gotFinalRef.current = true; stopCurrentRecognition(); setStatus('manual'); setErrorMessage(''); }} style={{
            marginTop: '20px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '8px 20px', color: 'rgba(255,255,255,0.25)',
            fontSize: '12px', cursor: 'pointer'
          }}>⌨️ Type instead</button>
        </>
      )}

      {status === 'editing' && (
        <>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch', width: '100%', maxWidth: '340px' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {captureConfidence > 0 && (
                <p style={{ marginBottom: '8px', fontSize: '30px', fontWeight: '700', color: captureConfidence > 0.7 ? 'rgba(74,222,128,0.6)' : captureConfidence > 0.4 ? 'rgba(251,191,36,0.6)' : 'rgba(252,165,165,0.6)' }}>
                  {Math.round(captureConfidence * 100)}%
                </p>
              )}
              {editReading && (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', letterSpacing: '1px' }}>{editReading}</p>
              )}
              <input type="text" value={editValue} onChange={e => { const chars = [...e.target.value]; const max = isJaMode ? 15 : 30; setEditValue(chars.length > max ? chars.slice(0, max).join('') : e.target.value); setEditReading(''); }}
                onKeyDown={e => e.key === 'Enter' && handleEditSubmit()}
                autoFocus
                style={{ width: '100%', padding: '14px 16px', fontSize: [...editValue].length > 9 ? '18px' : [...editValue].length > 6 ? '22px' : '26px', fontWeight: '700', border: 'none', borderRadius: '14px', textAlign: 'center', outline: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff' }} />
              <p style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', minHeight: '20px' }}>
                {lookupDef(editValue) || '\u00A0'}
              </p>
            </div>
            <button onClick={handleEditSubmit} disabled={!editValue.trim()} style={{
              flex: 'none', width: '64px', background: editValue.trim() ? '#ffe600' : 'rgba(255,255,255,0.05)',
              border: editValue.trim() ? 'none' : '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
              fontSize: '16px', fontWeight: '700', cursor: editValue.trim() ? 'pointer' : 'default',
              color: editValue.trim() ? '#1a1a2e' : 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: editReading ? '22px' : '0px', marginBottom: '24px',
            }}>Go</button>
          </div>
          {alternatives.length > 1 && (
            <div style={{ marginTop: '40px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>Change to:</span>
              {alternatives.slice(1).map((a, i) => {
                const eng = lookupDef(a.transcript);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <button onClick={() => setEditValue(a.transcript)} style={{
                      padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '20px', color: 'rgba(255,255,255,0.5)', fontSize: '14px', cursor: 'pointer',
                    }}>{a.transcript}</button>
                    {eng && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{eng}</span>}
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => { capLog('👆 "Try again" clicked'); startListening(); }}
            style={{
              marginTop: '32px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '8px 20px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          ><span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>↻</span> Try again</button>
        </>
      )}

      {status === 'picking' && (
        <>
          <p style={{ fontSize: '15px', fontWeight: '500', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
            <span style={{ fontWeight: '700', color: '#fff' }}>{transcript}</span> can mean:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '340px' }}>
            {candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => handlePickCandidate(c)}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px', padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>{c.description || c.english}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '56px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>{c.hiragana}</span>
                  <span style={{ fontSize: '24px', color: '#ffe600', fontFamily: "'Noto Serif JP', serif", lineHeight: 1.2 }}>{c.kanji}</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px' }}>›</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { capLog('👆 "Try again" clicked'); startListening(); }}
            style={{
              marginTop: '24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '8px 20px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          ><span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>↻</span> Try again</button>
        </>
      )}

      {status === 'success' && (
        <>
          <p style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>{transcript}</p>
          <div style={{
            marginTop: '28px', width: '44px', height: '44px',
            border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'rgba(255,255,255,0.7)',
            borderRadius: '50%', animation: 'spin 1s linear infinite'
          }}/>
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>
            {resolving ? 'Looking up Japanese...' : 'Loading...'}
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(252,165,165,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#fca5a5', maxWidth: '260px', textAlign: 'center' }}>{errorMessage}</p>
          <button
            onClick={() => { capLog('👆 "Try again" clicked'); startListening(); }}
            style={{
              marginTop: '24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '8px 20px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          ><span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>↻</span> Try again</button>
          <button onClick={() => setShowTipModal(true)} style={{
            marginTop: '24px', background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.2)', fontSize: '12px', cursor: 'pointer',
          }}>Voice tips</button>
        </>
      )}

      {status === 'manual' && (
        <>
          {speechMethod === 'manual' && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginBottom: '20px' }}>Add Google API key in Settings to enable voice capture</p>
          )}
          {errorMessage && <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{errorMessage}</p>}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch', width: '100%', maxWidth: '340px' }}>
            <input type="text" value={manualInput} onChange={(e) => { const chars = [...e.target.value]; const max = isJaMode ? 15 : 30; setManualInput(chars.length > max ? chars.slice(0, max).join('') : e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()} placeholder={isJaMode ? "Type in Japanese..." : "Type in English..."} autoFocus style={{
              flex: 1, minWidth: 0, padding: '14px 16px', fontSize: '24px', fontWeight: '600',
              border: 'none', borderRadius: '14px', textAlign: 'center', outline: 'none',
              background: 'rgba(255,255,255,0.08)', color: '#fff'
            }} />
            <button onClick={handleManualSubmit} disabled={!manualInput.trim()} style={{
              flex: 'none', width: '64px',
              background: manualInput.trim() ? '#ffe600' : 'rgba(255,255,255,0.05)',
              border: manualInput.trim() ? 'none' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', fontSize: '16px', fontWeight: '700',
              cursor: manualInput.trim() ? 'pointer' : 'default',
              color: manualInput.trim() ? '#1a1a2e' : 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>Go</button>
          </div>
          {speechMethod !== 'manual' && (
            <button onClick={startListening} style={{ marginTop: '32px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '16px', cursor: 'pointer', textDecoration: 'underline' }}>Try voice again</button>
          )}
        </>
      )}

      {/* Debug log panel — admin only */}
      {isAdmin && <button onClick={() => setShowDebugLog(!showDebugLog)} style={{
        position: 'fixed', bottom: '76px', right: '12px', zIndex: 250,
        background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '8px',
        padding: '4px 10px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
      }}>📋 {debugLog.length}</button>}

      {isAdmin && showDebugLog && (
        <div style={{
          position: 'fixed', bottom: '108px', right: '12px', left: '12px', zIndex: 250,
          background: '#0a0a0a', borderRadius: '12px', padding: '10px',
          maxHeight: '40vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffe600' }}>Capture Log v3.3.6 ({debugLog.length})</span>
            <button onClick={() => setDebugLog([])} style={{ background: 'none', border: 'none', fontSize: '10px', color: '#666', cursor: 'pointer' }}>Clear</button>
          </div>
          {debugLog.map((e, i) => (
            <div key={i} style={{
              fontSize: '11px', fontFamily: 'monospace', lineHeight: 1.5,
              color: e.level === 'error' ? '#f87171' : e.level === 'warn' ? '#fbbf24' : '#4ade80',
              borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '2px 0',
            }}>
              <span style={{ color: '#666', marginRight: '6px' }}>{e.time}</span>
              <span style={{ color: '#888', marginRight: '6px' }}>{e.ts}</span>
              {e.msg}
            </div>
          ))}
        </div>
      )}

      {showTipModal && (
        <VoiceTipModal onDismiss={handleTipDismiss} />
      )}

      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CapturePage;
