// ============================================
// REFERENCE DATABASES — pitch, JLPT, readings
// All stored in localStorage, loaded on-demand from GitHub via Settings UI
// ============================================

// ---- Kanjium Pitch Accent DB ----
// Source: https://github.com/mifunetoshiro/kanjium (CC BY-SA 4.0)
// Format: TSV with kanji\treading\taccent_number

const PITCH_DB_KEY = 'wordHunter_pitchDB';
const PITCH_DB_META_KEY = 'wordHunter_pitchDB_meta';

export const getPitchDB = () => {
  try {
    const raw = localStorage.getItem(PITCH_DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

export const getPitchDBMeta = () => {
  try {
    const raw = localStorage.getItem(PITCH_DB_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

// Parse Kanjium accents.txt (TSV: kanji\treading\taccent) into a lookup map
// Key: "kanji:reading" or just "reading" for kana-only words
// Value: accent number (downstep position)
export const importPitchDB = (tsvText) => {
  const db = {};
  let count = 0;
  const lines = tsvText.split('\n');
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const kanji = parts[0].trim();
      const reading = parts[1].trim();
      const accent = parseInt(parts[2].trim(), 10);
      if (kanji && reading && !isNaN(accent)) {
        db[kanji + ':' + reading] = accent;
        if (!db[reading]) db[reading] = accent; // first reading wins for kana-only lookup
        count++;
      }
    }
  }
  localStorage.setItem(PITCH_DB_KEY, JSON.stringify(db));
  localStorage.setItem(PITCH_DB_META_KEY, JSON.stringify({
    count,
    importedAt: new Date().toISOString()
  }));
  return count;
};

// ---- JLPT Level DB ----

const JLPT_DB_KEY = 'wordHunter_jlptDB';
const JLPT_DB_META_KEY = 'wordHunter_jlptDB_meta';

export const getJlptDB = () => {
  try {
    const raw = localStorage.getItem(JLPT_DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

export const getJlptDBMeta = () => {
  try {
    const raw = localStorage.getItem(JLPT_DB_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

// Import pre-converted JLPT lookup JSON: {"word": "N1", "食べる": "N5", ...}
export const importJlptDB = (jsonText) => {
  try {
    const db = JSON.parse(jsonText);
    const count = Object.keys(db).length;
    localStorage.setItem(JLPT_DB_KEY, JSON.stringify(db));
    localStorage.setItem(JLPT_DB_META_KEY, JSON.stringify({
      count,
      importedAt: new Date().toISOString()
    }));
    return count;
  } catch(e) {
    console.error('[JLPT DB] Parse error:', e);
    return 0;
  }
};

// Lookup JLPT level for a word
export const lookupJlptLevel = (kanji, hiragana) => {
  const db = getJlptDB();
  if (!db) return null;
  return db[kanji] || db[hiragana] || null;
};

// ---- Kanji Readings DB (KANJIDIC) ----
// Source: KANJIDIC via davidluzgouveia/kanji-data (CC BY-SA 4.0)
// Format: {"kanji": ["reading1", "reading2", ...]} — all readings in hiragana

const READINGS_DB_KEY = 'wordHunter_readingsDB';
const READINGS_DB_META_KEY = 'wordHunter_readingsDB_meta';

export const getReadingsDB = () => {
  try {
    const raw = localStorage.getItem(READINGS_DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

export const getReadingsDBMeta = () => {
  try {
    const raw = localStorage.getItem(READINGS_DB_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
};

// Import pre-converted readings JSON: {"連": ["れん"], "続": ["ぞく", "つづ"], ...}
export const importReadingsDB = (jsonText) => {
  try {
    const db = JSON.parse(jsonText);
    const count = Object.keys(db).length;
    localStorage.setItem(READINGS_DB_KEY, JSON.stringify(db));
    localStorage.setItem(READINGS_DB_META_KEY, JSON.stringify({
      count,
      importedAt: new Date().toISOString()
    }));
    return count;
  } catch(e) {
    console.error('[Readings DB] Parse error:', e);
    return 0;
  }
};

// Get all known readings for a single kanji character
export const getKanjiReadings = (kanjiChar) => {
  const db = getReadingsDB();
  if (!db) return null;
  return db[kanjiChar] || null;
};
