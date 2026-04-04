// ============================================
// API HELPERS — Cloud Function proxy + all fetch functions
// ============================================

import { getAuthToken, CF_URLS } from '../config/firebase.js';

// Generic Cloud Function call with Firebase auth
export const callCloudFunction = async (functionName, params) => {
  const token = await getAuthToken();
  const response = await fetch(CF_URLS[functionName], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`CF ${functionName} error ${response.status}: ${errorBody.slice(0, 200)}`);
  }
  const json = await response.json();
  // Cloud Functions wrap Anthropic results in { result: ... }
  // Unwrap if present, otherwise return raw (e.g. synthesizeSpeech returns { audioContent })
  return json.result !== undefined ? json.result : json;
};

// Phase 1: Quick fetch — kanji, reading, definition, context (small, fast response)
export const fetchCoreData = async (word, sourceContext) => {
  try {
    console.log('[fetchCoreData] Calling Cloud Function for:', word, sourceContext ? '(from: ' + sourceContext + ')' : '');
    const parsed = await callCloudFunction('fetchCoreData', { word, sourceContext });
    console.log('[fetchCoreData] Parsed result:', parsed);
    return parsed;
  } catch (error) {
    console.error('[fetchCoreData] FAILED:', error.message, error);
    return null;
  }
};

// Phase 2a: Pitch accent + example sentences
export const fetchPitchAndSentences = async (word, skipPitch = false, jlpt = null, definitions = []) => {
  try {
    return await callCloudFunction('fetchPitchAndSentences', { word, skipPitch, jlpt, definitions });
  } catch (error) {
    console.error('[fetchPitchAndSentences] FAILED:', error);
    return null;
  }
};

// Phase 2b: Kanji details
export const fetchKanjiDetails = async (word) => {
  try {
    const parsed = await callCloudFunction('fetchKanjiDetails', { word });
    return Array.isArray(parsed) ? parsed : (parsed.kanjiDetails || []);
  } catch (error) {
    console.error('[fetchKanjiDetails] FAILED:', error);
    return [];
  }
};

// Post-process sentence parts: split mixed kanji+kana chunks so furigana only sits above kanji
export const splitMixedPart = (part) => {
  const { text, reading, highlight } = part;
  if (!reading || !text) return [part];

  const isKanji = c => /[\u4e00-\u9faf]/.test(c);
  const isKana = c => /[\u3040-\u309f\u30a0-\u30ff]/.test(c);
  const toHiragana = c => c.charCodeAt(0) >= 0x30A0 && c.charCodeAt(0) <= 0x30FF ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c;

  const hasKanjiChar = [...text].some(isKanji);
  const hasKanaChar = [...text].some(isKana);
  if (!hasKanjiChar || !hasKanaChar) return [part];

  const segments = [];
  let cur = { chars: '', type: null };
  for (const ch of text) {
    const type = isKanji(ch) ? 'kanji' : 'kana';
    if (type !== cur.type && cur.chars) { segments.push({ ...cur }); cur = { chars: '', type: null }; }
    cur.chars += ch; cur.type = type;
  }
  if (cur.chars) segments.push(cur);
  if (segments.length <= 1) return [part];

  const rc = [...reading];
  let ri = 0;
  const result = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.type === 'kana') {
      const sc = [...seg.chars];
      let ok = true;
      for (let i = 0; i < sc.length; i++) {
        if (!rc[ri + i] || toHiragana(sc[i]) !== toHiragana(rc[ri + i])) { ok = false; break; }
      }
      if (!ok) return [part];
      ri += sc.length;
      result.push({ text: seg.chars, ...(highlight ? { highlight: true } : {}) });
    } else {
      const nextKana = segments[si + 1];
      if (nextKana && nextKana.type === 'kana') {
        const anchor = toHiragana([...nextKana.chars][0]);
        let end = ri;
        while (end < rc.length && toHiragana(rc[end]) !== anchor) end++;
        result.push({ text: seg.chars, reading: rc.slice(ri, end).join(''), ...(highlight ? { highlight: true } : {}) });
        ri = end;
      } else {
        result.push({ text: seg.chars, reading: rc.slice(ri).join(''), ...(highlight ? { highlight: true } : {}) });
        ri = rc.length;
      }
    }
  }
  return result;
};

export const splitSentenceParts = (sentences) => {
  if (!sentences) return [];
  return sentences.map(s => ({
    ...s,
    parts: s.parts ? s.parts.flatMap(splitMixedPart) : []
  }));
};

// Phase 2 wrapper: pitch+sentences and kanji details in parallel
export const fetchExtendedData = async (word, skipPitch = false, jlpt = null, definitions = []) => {
  try {
    const [sonnetData, kanjiDetails] = await Promise.all([
      fetchPitchAndSentences(word, skipPitch, jlpt, definitions),
      fetchKanjiDetails(word)
    ]);
    const processedSentences = splitSentenceParts(sonnetData?.sentences || []);
    console.log('[fetchExtendedData] sentences:', processedSentences.length, 'kanji:', kanjiDetails.length);
    return {
      pitchAccent: sonnetData?.pitchAccent || [],
      sentences: processedSentences,
      kanjiDetails
    };
  } catch (error) {
    console.error('Failed to fetch extended data:', error);
    return null;
  }
};

// Resolve English word → Japanese candidates via Cloud Function
export const resolveEnglishToJapanese = async (englishWord) => {
  try {
    const parsed = await callCloudFunction('resolveEnglish', { englishWord });
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('Failed to resolve English→Japanese:', error);
    return null;
  }
};

// Google Cloud TTS via Cloud Function — natural Japanese pronunciation
export const playGoogleTTS = async (text, speed = 1.0, hiraganaHint = null) => {
  try {
    const data = await callCloudFunction('synthesizeSpeech', { text, hiraganaHint, speed });
    if (data.audioContent) {
      return new Audio('data:audio/mp3;base64,' + data.audioContent);
    }
    if (hiraganaHint) {
      console.warn('[GoogleTTS] SSML may have failed, retrying without hint...');
      return playGoogleTTS(text, speed, null);
    }
    return null;
  } catch (error) {
    console.error('[GoogleTTS] Failed:', error);
    if (hiraganaHint) {
      console.warn('[GoogleTTS] Retrying with plain text...');
      return playGoogleTTS(text, speed, null);
    }
    return null;
  }
};

// ============================================
// WORD STORE — per-user Firestore CRUD
// ============================================

// Fetch all words for the current user
export const getWords = async () => {
  try {
    const data = await callCloudFunction('getWords', {});
    return data.words || {};
  } catch (error) {
    console.error('[getWords] FAILED:', error.message);
    return {};
  }
};

// Upsert a single word document
export const saveWord = async (word, data) => {
  try {
    await callCloudFunction('saveWord', { word, data });
  } catch (error) {
    console.error('[saveWord] FAILED:', error.message);
  }
};

// Partial update (pin toggle, capturedAt bump)
export const updateWordField = async (word, fields) => {
  try {
    await callCloudFunction('updateWordField', { word, fields });
  } catch (error) {
    console.error('[updateWordField] FAILED:', error.message);
  }
};

// Batch delete a list of words by kanji key
export const deleteWords = async (words) => {
  try {
    await callCloudFunction('deleteWords', { words });
  } catch (error) {
    console.error('[deleteWords] FAILED:', error.message);
  }
};

// Admin — fetch all users with stats
export const getAdminUsers = async () => {
  const data = await callCloudFunction('getAdminUsers', {});
  return data.users || [];
};

// Estimate per-mora timing from total audio duration
export const getMoraTimings = (pitchAccent, totalDuration) => {
  if (!pitchAccent || pitchAccent.length === 0) return [];
  const speechDuration = totalDuration * 0.85;
  const startOffset = totalDuration * 0.08;
  const moraWeight = (kana) => {
    if (kana === 'っ') return 0.5;
    if (kana === 'ん') return 0.8;
    if (kana === 'ー') return 1.2;
    if (/^[うおいえあ]$/.test(kana)) return 0.9;
    return 1.0;
  };
  const weights = pitchAccent.map(m => moraWeight(m.kana));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const timings = [];
  let elapsed = startOffset;
  for (let i = 0; i < pitchAccent.length; i++) {
    const dur = (weights[i] / totalWeight) * speechDuration;
    timings.push({ start: elapsed, duration: dur });
    elapsed += dur;
  }
  return timings;
};
