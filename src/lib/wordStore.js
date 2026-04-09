// ============================================
// WORD STORE — word data management (Firestore-backed via App.jsx)
// Persistence removed from this module — App.jsx calls api.js directly.
// ============================================

import { firebaseAuth } from '../config/firebase.js';
import { lookupJlptLevel, getReadingsDB } from './databases.js';
import { lookupPitchAccent, moraToRomaji } from './pitch.js';
import { fetchCoreData, fetchExtendedData, logAudit } from './api.js';

// DEPRECATED: Static mock data from early development. Still used as offline fallback
// for these 3 words. Remove once all data comes from API. Only referenced in WordStore.get().
const dictionaryData = {
  '冒険': {
    kanji: '冒険',
    hiragana: 'ぼうけん',
    romaji: 'bou-ken',
    english: 'adventure',
    partOfSpeech: 'noun, suru verb',
    definition: "An exciting or daring experience involving risk or the unknown. Use when describing journeys, challenges, or trying something new and uncertain.",
    contextUsage: { daily: 2, media: 3, business: 1, academic: 0 },
    jlpt: 'N3',
    pitchAccent: [
      { kana: 'ぼ', pitch: 0, romaji: 'bo' },
      { kana: 'う', pitch: 1, romaji: 'u' },
      { kana: 'け', pitch: 1, romaji: 'ke' },
      { kana: 'ん', pitch: 1, romaji: 'n' }
    ],
    sentences: [
      { id: 1, parts: [{ text: '新', reading: 'あたら' }, { text: 'しい' }, { text: '冒険', reading: 'ぼうけん', highlight: true }, { text: 'が' }, { text: '始', reading: 'はじ' }, { text: 'まる。' }], english: 'A new adventure begins.' },
      { id: 2, parts: [{ text: '子供', reading: 'こども' }, { text: 'の' }, { text: '頃', reading: 'ころ' }, { text: '、' }, { text: '冒険', reading: 'ぼうけん', highlight: true }, { text: 'が' }, { text: '大好', reading: 'だいす' }, { text: 'きだった。' }], english: 'As a child, I loved adventures.' },
      { id: 3, parts: [{ text: 'この' }, { text: '旅', reading: 'たび' }, { text: 'は' }, { text: '大', reading: 'おお' }, { text: 'きな' }, { text: '冒険', reading: 'ぼうけん', highlight: true }, { text: 'だ。' }], english: 'This trip is a big adventure.' }
    ],
    kanjiDetails: [
      { kanji: '冒', meaning: 'risk, brave, challenge', strokeCount: 9 },
      { kanji: '険', meaning: 'steep, dangerous, harsh', strokeCount: 11 }
    ]
  },
  '食べる': {
    kanji: '食べる',
    hiragana: 'たべる',
    romaji: 'ta-be-ru',
    english: 'to eat',
    partOfSpeech: 'ichidan verb',
    definition: "To eat or consume food. One of the most essential daily verbs in Japanese.",
    contextUsage: { daily: 3, media: 2, business: 1, academic: 1 },
    jlpt: 'N5',
    pitchAccent: [
      { kana: 'た', pitch: 0, romaji: 'ta' },
      { kana: 'べ', pitch: 1, romaji: 'be' },
      { kana: 'る', pitch: 0, romaji: 'ru' }
    ],
    sentences: [
      { id: 1, parts: [{ text: '朝', reading: 'あさ' }, { text: 'ごはんを' }, { text: '食', reading: 'た', highlight: true }, { text: 'べる', highlight: true }, { text: '。' }], english: 'I eat breakfast.' },
      { id: 2, parts: [{ text: '何', reading: 'なに' }, { text: 'を' }, { text: '食', reading: 'た', highlight: true }, { text: 'べたい', highlight: true }, { text: '？' }], english: 'What do you want to eat?' },
      { id: 3, parts: [{ text: 'もう' }, { text: '食', reading: 'た', highlight: true }, { text: 'べました', highlight: true }, { text: '。' }], english: 'I already ate.' }
    ],
    kanjiDetails: [
      { kanji: '食', meaning: 'eat, food, meal', strokeCount: 9 }
    ]
  },
  '勉強': {
    kanji: '勉強',
    hiragana: 'べんきょう',
    romaji: 'ben-kyou',
    english: 'study',
    partOfSpeech: 'noun, suru verb',
    definition: "Study or learning. Used for academic study, practice, or the act of learning something new.",
    contextUsage: { daily: 2, media: 1, business: 1, academic: 3 },
    jlpt: 'N5',
    pitchAccent: [
      { kana: 'べ', pitch: 0, romaji: 'be' },
      { kana: 'ん', pitch: 1, romaji: 'n' },
      { kana: 'きょ', pitch: 1, romaji: 'kyo' },
      { kana: 'う', pitch: 1, romaji: 'u' }
    ],
    sentences: [
      { id: 1, parts: [{ text: '日本語', reading: 'にほんご' }, { text: 'を' }, { text: '勉強', reading: 'べんきょう', highlight: true }, { text: 'する。' }], english: 'I study Japanese.' },
      { id: 2, parts: [{ text: '毎日', reading: 'まいにち' }, { text: '勉強', reading: 'べんきょう', highlight: true }, { text: 'しています。' }], english: 'I study every day.' },
      { id: 3, parts: [{ text: '勉強', reading: 'べんきょう', highlight: true }, { text: 'は' }, { text: '大切', reading: 'たいせつ' }, { text: 'だ。' }], english: 'Studying is important.' }
    ],
    kanjiDetails: [
      { kanji: '勉', meaning: 'exertion, endeavor', strokeCount: 10 },
      { kanji: '強', meaning: 'strong, powerful', strokeCount: 11 }
    ]
  }
};

// Word Store — pure data management (no persistence)
export const WordStore = {

  // Generate rubyParts from kanji string + hiragana reading
  generateRubyParts: (kanji, hiragana) => {
    if (!kanji || !hiragana) return [];
    try {
      const isKanji = (c) => /[\u4e00-\u9faf\u3400-\u4dbf]/.test(c);
      const isKana = (c) => /[\u3040-\u309f\u30a0-\u30ff]/.test(c);
      const toHiragana = c => c.charCodeAt(0) >= 0x30A0 && c.charCodeAt(0) <= 0x30FF ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c;

      const chars = [...kanji];
      const rc = [...hiragana];

      if (chars.every(c => isKana(c))) {
        return chars.map(c => ({ base: c }));
      }

      const segments = [];
      let cur = { chars: '', type: null };
      for (const ch of chars) {
        const type = isKanji(ch) ? 'kanji' : 'kana';
        if (type !== cur.type && cur.chars) { segments.push({ ...cur }); cur = { chars: '', type: null }; }
        cur.chars += ch; cur.type = type;
      }
      if (cur.chars) segments.push(cur);

      let ri = 0;
      const parts = [];

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        if (seg.type === 'kana') {
          const sc = [...seg.chars];
          for (const ch of sc) {
            parts.push({ base: ch });
          }
          ri += sc.length;
        } else {
          const nextKanaSeg = segments.slice(si + 1).find(s => s.type === 'kana');
          let readingEnd;

          if (nextKanaSeg) {
            const anchor = toHiragana([...nextKanaSeg.chars][0]);
            const minReading = [...seg.chars].length;
            readingEnd = ri + minReading;
            while (readingEnd < rc.length && toHiragana(rc[readingEnd]) !== anchor) readingEnd++;
          } else {
            readingEnd = rc.length;
          }

          const kanjiChars = [...seg.chars];
          const readingSlice = rc.slice(ri, readingEnd).join('');

          if (kanjiChars.length === 1) {
            parts.push({ base: kanjiChars[0], ruby: readingSlice });
          } else {
            const split = WordStore.splitKanjiReading(kanjiChars, readingSlice);
            parts.push(...split);
          }
          ri = readingEnd;
        }
      }

      return parts;
    } catch(e) {
      console.error('[generateRubyParts] Error for', kanji, hiragana, e);
      return [];
    }
  },

  // e.g. ["連","続","最","適","化"], "れんぞくさいてきか"
  //   → [{base:"連",ruby:"れん"}, {base:"続",ruby:"ぞく"}, ...]
  splitKanjiReading: (kanjiChars, reading) => {
    const db = getReadingsDB();

    const solve = (ki, ri) => {
      if (ki === kanjiChars.length) {
        return ri === reading.length ? [] : null;
      }
      if (ri >= reading.length) return null;

      const kanjiChar = kanjiChars[ki];
      const remaining = reading.slice(ri);
      const knownReadings = db ? db[kanjiChar] : null;

      if (knownReadings) {
        const sorted = [...knownReadings].sort((a, b) => b.length - a.length);
        for (const r of sorted) {
          if (remaining.startsWith(r)) {
            const rest = solve(ki + 1, ri + r.length);
            if (rest !== null) {
              return [{ base: kanjiChar, ruby: r }, ...rest];
            }
          }
        }
      }

      if (ki === kanjiChars.length - 1) {
        return [{ base: kanjiChar, ruby: remaining }];
      }

      for (const len of [2, 1, 3, 4]) {
        if (len > remaining.length) continue;
        const rest = solve(ki + 1, ri + len);
        if (rest !== null) {
          return [{ base: kanjiChar, ruby: remaining.slice(0, len) }, ...rest];
        }
      }

      return null;
    };

    const result = solve(0, 0);
    if (result) return result;
    return [{ base: kanjiChars.join(''), ruby: reading }];
  },

  // Ensure word data has all required fields with safe defaults
  normalize: (data) => {
    if (!data) return data;

    const rubyParts = (data.kanji && data.hiragana)
      ? WordStore.generateRubyParts(data.kanji, data.hiragana)
      : [];

    let pitchAccent = data.pitchAccent || [];
    let pitchSource = data.pitchSource || null;
    if (pitchSource !== 'kanjium' && data.kanji && data.hiragana) {
      const kanjiumPitch = lookupPitchAccent(data.kanji, data.hiragana);
      if (kanjiumPitch) {
        pitchAccent = kanjiumPitch;
        pitchSource = 'kanjium';
      }
    }

    // Sanitize AI pitchAccent: merge incorrectly split compound morae
    if (pitchAccent.length > 0) {
      const smallKana = /^[ゃゅょャュョァィゥェォ]$/;
      const fixed = [];
      for (let i = 0; i < pitchAccent.length; i++) {
        const next = pitchAccent[i + 1];
        if (next && smallKana.test(next.kana)) {
          fixed.push({
            kana: pitchAccent[i].kana + next.kana,
            pitch: pitchAccent[i].pitch,
            romaji: moraToRomaji(pitchAccent[i].kana + next.kana) || (pitchAccent[i].romaji + next.romaji)
          });
          i++;
        } else {
          fixed.push(pitchAccent[i]);
        }
      }
      pitchAccent = fixed;
    }

    return {
      kanji: data.kanji || '?',
      hiragana: data.hiragana || '',
      romaji: data.romaji || '—',
      english: data.english || '',
      partOfSpeech: data.partOfSpeech || 'unknown',
      definition: data.definition || (data.definitions && data.definitions[0] ? data.definitions[0].definition : ''),
      definitions: data.definitions || (data.definition ? [{ rank: 'primary', frequency: 'common', meaning: data.english || '', definition: data.definition }] : []),
      jlpt: lookupJlptLevel(data.kanji, data.hiragana) || data.jlpt || '?',
      rubyParts: rubyParts || [],
      contextUsage: data.contextUsage || { daily: 0, media: 0, business: 0, academic: 0 },
      pitchAccent,
      pitchSource,
      sentences: data.sentences || [],
      kanjiDetails: data.kanjiDetails || [],
      capturedAt: data.capturedAt || new Date().toISOString(),
      isPlaceholder: data.isPlaceholder || false,
      isPartial: data.isPartial || false,
      fetchedAt: data.fetchedAt || null,
      pinned: data.pinned || false
    };
  },

  // Get a word (from dictionary, then store, then return null for new)
  get: (word, store) => {
    if (dictionaryData[word]) {
      return { data: WordStore.normalize(dictionaryData[word]), source: 'dictionary' };
    }
    if (store[word]) {
      return { data: WordStore.normalize(store[word]), source: 'stored' };
    }
    return { data: null, source: 'new' };
  },

  // Fetch word data progressively: core first, extended in background
  fetchOrCreateWord: async (word, onCoreReady, sourceContext, captureContext) => {
    console.log(`[WordStore] fetchOrCreateWord("${word}")${sourceContext ? ' from: ' + sourceContext : ''}, Auth: ${firebaseAuth.currentUser ? 'YES' : 'NO'}`);

    if (!firebaseAuth.currentUser) {
      console.warn('[WordStore] Not signed in — falling back to placeholder');
      return WordStore.createPlaceholder(word);
    }

    console.log('[WordStore] Phase 1: fetching core data...');
    const coreData = await fetchCoreData(word, sourceContext);
    console.log('[WordStore] Phase 1 result:', coreData ? 'SUCCESS' : 'FAILED');

    if (coreData) {
      const kanjiumPitch = lookupPitchAccent(coreData.kanji || word, coreData.hiragana || '');
      if (kanjiumPitch) console.log('[WordStore] Kanjium pitch found:', coreData.kanji);

      const partialWord = {
        ...coreData,
        contextUsage: coreData.contextUsage || { daily: 1, media: 1, business: 0, academic: 0 },
        pitchAccent: kanjiumPitch || [],
        pitchSource: kanjiumPitch ? 'kanjium' : null,
        sentences: [],
        kanjiDetails: [],
        fetchedAt: new Date().toISOString(),
        isPlaceholder: false,
        isPartial: true
      };

      if (onCoreReady) onCoreReady(WordStore.normalize(partialWord));

      console.log('[WordStore] Phase 2: fetching extended data...' + (kanjiumPitch ? ' (skipping pitch — Kanjium has it)' : ''));
      const japaneseWord = coreData.kanji || word;
      const extData = await fetchExtendedData(japaneseWord, !!kanjiumPitch, coreData.jlpt, coreData.definitions || []);
      console.log('[WordStore] Phase 2 result:', extData ? 'SUCCESS' : 'FAILED');

      if (extData) {
        const finalPitch = kanjiumPitch || extData.pitchAccent || partialWord.pitchAccent;
        const finalPitchSource = kanjiumPitch ? 'kanjium' : (extData.pitchAccent ? 'ai' : null);

        // Fire-and-forget audit log
        const ctx = captureContext || {};
        logAudit({
          word,
          inputLang: ctx.inputLang || 'ja',
          englishInput: ctx.englishInput || null,
          resolveEnglish: ctx.resolveEnglish || null,
          coreData,
          pitchAndSentences: { pitchAccent: extData.pitchAccent || [], sentences: extData.sentences || [] },
          kanjiDetails: extData.kanjiDetails || [],
          pitchSource: finalPitchSource,
        });

        return WordStore.normalize({
          ...partialWord,
          pitchAccent: finalPitch,
          pitchSource: finalPitchSource,
          sentences: extData.sentences || partialWord.sentences,
          kanjiDetails: extData.kanjiDetails || partialWord.kanjiDetails,
          isPartial: false
        });
      }

      // Phase 2 failed — still log what we got from Phase 1
      const ctx2 = captureContext || {};
      logAudit({
        word,
        inputLang: ctx2.inputLang || 'ja',
        englishInput: ctx2.englishInput || null,
        resolveEnglish: ctx2.resolveEnglish || null,
        coreData,
        pitchAndSentences: null,
        kanjiDetails: null,
        pitchSource: kanjiumPitch ? 'kanjium' : null,
      });

      return WordStore.normalize({ ...partialWord, isPartial: false });
    }

    console.warn('[WordStore] Both phases failed — using placeholder');
    return WordStore.createPlaceholder(word);
  },

  createPlaceholder: (capturedWord) => {
    const chars = capturedWord.split('').filter(c => c.match(/[\u4e00-\u9faf]/));

    const kanjiDetails = chars.length > 0
      ? chars.map(c => ({
          kanji: c,
          meaning: 'Meaning not yet loaded',
          strokeCount: Math.floor(Math.random() * 10) + 5
        }))
      : [{
          kanji: capturedWord[0] || '?',
          meaning: 'Meaning not yet loaded',
          strokeCount: 1
        }];

    const pitchAccent = capturedWord.split('').map((c, i) => ({
      kana: c,
      pitch: i === 0 ? 0 : 1,
      romaji: '—'
    }));

    const sentences = [
      { id: 1, parts: [{ text: capturedWord, highlight: true }, { text: 'を使います。' }], english: `Using "${capturedWord}".` },
      { id: 2, parts: [{ text: 'これは' }, { text: capturedWord, highlight: true }, { text: 'です。' }], english: `This is "${capturedWord}".` },
      { id: 3, parts: [{ text: capturedWord, highlight: true }, { text: 'の意味は？' }], english: `What does "${capturedWord}" mean?` }
    ];

    return {
      kanji: capturedWord,
      hiragana: capturedWord,
      romaji: '—',
      english: 'Translation pending...',
      definition: `"${capturedWord}" — This word was captured but full dictionary data hasn't been loaded yet. In the full app, this would be fetched from a Japanese dictionary API.`,
      contextUsage: { daily: 1, media: 1, business: 0, academic: 0 },
      jlpt: '?',
      pitchAccent,
      sentences,
      kanjiDetails,
      capturedAt: new Date().toISOString(),
      isPlaceholder: true
    };
  },

  getAllWords: (store) => {
    return Object.keys(store).map(key => ({ word: key, ...store[key] }));
  }
};
