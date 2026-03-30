// ============================================
// PITCH ACCENT UTILITIES
// ============================================

import { getPitchDB } from './databases.js';

// Split Japanese text into morae (not characters)
// e.g. "きょう" → ["きょ", "う"]
export const splitIntoMorae = (text) => {
  const morae = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];
    // Check if next char is a small kana (part of compound mora)
    if (next && /[ゃゅょャュョァィゥェォ]/.test(next)) {
      morae.push(c + next);
      i++; // skip next
    } else {
      morae.push(c);
    }
  }
  return morae;
};

// Basic mora to romaji conversion (~80 entries, static lookup — no API call)
export const moraToRomaji = (mora) => {
  const map = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','を':'wo','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'di','づ':'du','で':'de','ど':'do',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'っ':'Q',
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo'
  };
  return map[mora] || mora;
};

// Convert downstep position to pitch array [{kana, pitch, romaji}]
// downstep: 0=heiban (no drop), 1=atamadaka, N=drop after mora N
export const downstepToPitchArray = (reading, downstep) => {
  const morae = splitIntoMorae(reading);

  return morae.map((mora, i) => {
    let pitch;
    if (downstep === 0) {
      pitch = i === 0 ? 0 : 1;
    } else if (downstep === 1) {
      pitch = i === 0 ? 1 : 0;
    } else {
      if (i === 0) pitch = 0;
      else if (i < downstep) pitch = 1;
      else pitch = 0;
    }
    return { kana: mora, pitch, romaji: moraToRomaji(mora) };
  });
};

// Look up pitch accent from Kanjium DB
// Returns pitch array or null if not found
export const lookupPitchAccent = (kanji, reading) => {
  const db = getPitchDB();
  if (!db) return null;

  const key1 = kanji + ':' + reading;
  if (db[key1] !== undefined) {
    return downstepToPitchArray(reading, db[key1]);
  }

  if (db[reading] !== undefined) {
    return downstepToPitchArray(reading, db[reading]);
  }

  return null;
};
