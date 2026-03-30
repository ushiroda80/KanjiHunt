import React, { useState, useEffect, useRef } from 'react';
import FuriganaText from './FuriganaText';
import { ContextTag } from './Tags';
import TabLoading from './TabLoading';
import { playGoogleTTS, getMoraTimings } from '../lib/api';

export const DefineTab = ({ word }) => {
  const jlptColors = { 'N5': '#4ade80', 'N4': '#a3e635', 'N3': '#f59e0b', 'N2': '#f472b6', 'N1': '#ef4444' };
  const jlptColor = jlptColors[word.jlpt] || '#888';
  const ctx = word.contextUsage || { daily: 0, media: 0, business: 0, academic: 0 };
  const defs = word.definitions || [];
  const [expandedDefs, setExpandedDefs] = useState({});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {defs.length > 0 ? defs.map((d, i) => {
          const isRare = d.frequency === 'rare';
          const isUncommon = d.frequency === 'uncommon';
          const isFaded = isRare || isUncommon;
          const isCollapsed = i > 0 && !expandedDefs[i];
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: isRare ? '#aaa' : isUncommon ? '#999' : '#1a1a1a' }}>{d.meaning}</span>
                {isUncommon && (
                  <span style={{
                    fontSize: '9px', fontWeight: '700', letterSpacing: '0.2px',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: '10px',
                    lineHeight: '14px', whiteSpace: 'nowrap',
                    background: '#fef9c3', color: '#ca8a04'
                  }}>Uncommon</span>
                )}
                {isRare && (
                  <span style={{
                    fontSize: '9px', fontWeight: '700', letterSpacing: '0.2px',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: '10px',
                    lineHeight: '14px', whiteSpace: 'nowrap',
                    background: '#fef2f2', color: '#b45309'
                  }}>Rare</span>
                )}
              </div>
              {isCollapsed ? (
                <button
                  onClick={() => setExpandedDefs(prev => ({ ...prev, [i]: true }))}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                    fontSize: '12px', color: '#999', fontStyle: 'italic'
                  }}
                >Show definition ›</button>
              ) : (
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: isRare ? '#bbb' : isUncommon ? '#999' : '#444' }}>{d.definition}</div>
              )}
            </div>
          );
        }) : (
          <div style={{ fontSize: '14px', lineHeight: 1.7, color: '#333' }}>{word.definition || 'Definition loading...'}</div>
        )}
      </div>
      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.1), transparent)', margin: '4px 0' }}/>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {['daily', 'media', 'business', 'academic'].map(c => {
          const level = ctx[c] || 0;
          if (level !== 0 && level !== 3) return null;
          return <ContextTag key={c} context={c} usageLevel={level} />;
        })}
      </div>
    </div>
  );
};

export const ExamplesTab = ({ word }) => {
  const sentences = word.sentences || [];
  const defs = word.definitions || [];

  if (sentences.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
        <p style={{ fontSize: '14px', fontWeight: '600' }}>No examples available yet</p>
        <p style={{ fontSize: '12px', marginTop: '8px' }}>Examples may still be loading</p>
      </div>
    );
  }

  const groups = [];
  if (defs.length > 1) {
    const used = new Set();
    defs.forEach((d) => {
      const matching = [];
      sentences.forEach((s, si) => {
        if (used.has(si) || !s.defMeaning) return;
        const dm = s.defMeaning.toLowerCase().trim();
        const defM = d.meaning.toLowerCase().trim();
        if (dm === defM || dm.includes(defM) || defM.includes(dm)) {
          matching.push(s);
          used.add(si);
        }
      });
      groups.push({ def: d, sentences: matching });
    });
    sentences.forEach((s, si) => {
      if (used.has(si) || !s.defMeaning) return;
      const dm = s.defMeaning.toLowerCase();
      for (let g = 0; g < groups.length; g++) {
        const keywords = groups[g].def.meaning.toLowerCase().split(/[\s\/,]+/).filter(w => w.length > 2);
        if (keywords.some(kw => dm.includes(kw))) {
          groups[g].sentences.push(s);
          used.add(si);
          break;
        }
      }
    });
    const unmatched = sentences.filter((_, si) => !used.has(si));
    unmatched.forEach((s, i) => {
      const emptyGroup = groups.find(g => g.sentences.length === 0);
      if (emptyGroup) {
        emptyGroup.sentences.push(s);
      } else {
        groups[i % groups.length].sentences.push(s);
      }
    });
  } else {
    groups.push({ def: defs[0] || null, sentences });
  }

  let counter = 0;
  const multiDef = defs.length > 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {groups.map((group, gi) => {
        const d = group.def;
        const isRare = d && d.frequency === 'rare';
        const isUncommon = d && d.frequency === 'uncommon';
        if (group.sentences.length === 0 && multiDef) return null;
        return (
          <div key={gi}>
            {multiDef && d && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', marginTop: gi > 0 ? '16px' : '0' }}>
                <span style={{ fontSize: '10px', fontWeight: '600', color: isRare ? '#bbb' : isUncommon ? '#aaa' : '#888' }}>{d.meaning}</span>
                {isUncommon && (
                  <span style={{
                    fontSize: '9px', fontWeight: '700', letterSpacing: '0.2px',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: '10px',
                    lineHeight: '14px', whiteSpace: 'nowrap',
                    background: '#fef9c3', color: '#ca8a04'
                  }}>Uncommon</span>
                )}
                {isRare && (
                  <span style={{
                    fontSize: '9px', fontWeight: '700', letterSpacing: '0.2px',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: '10px',
                    lineHeight: '14px', whiteSpace: 'nowrap',
                    background: '#fef2f2', color: '#b45309'
                  }}>Rare</span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {group.sentences.map((sentence, si) => {
                counter++;
                return (
                  <div key={sentence.id || counter} style={{
                    background: '#fff', borderRadius: '12px', padding: '2px 14px 8px 14px',
                    border: '1px solid #f0f0f0'
                  }}>
                    <FuriganaText parts={sentence.parts || []} />
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{sentence.english || ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const PitchVisual = ({ pitchAccent, activeMora = -1 }) => {
  if (!pitchAccent || pitchAccent.length < 2) {
    return <div style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px' }}>Pitch data not available</div>;
  }

  const count = pitchAccent.length;
  const colW = 36;
  const totalW = count * colW;
  const highY = 14;
  const lowY = 42;
  const svgH = 56;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={totalW} height={svgH}>
        {pitchAccent.map((item, i) => {
          if (i === count - 1) return null;
          const x1 = i * colW + colW / 2;
          const y1 = item.pitch === 1 ? highY : lowY;
          const x2 = (i + 1) * colW + colW / 2;
          const y2 = pitchAccent[i + 1].pitch === 1 ? highY : lowY;
          const isActiveLine = i === activeMora || i + 1 === activeMora;
          return <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ff3366" strokeWidth="2.5" strokeLinecap="round"
            style={{ opacity: activeMora >= 0 ? (isActiveLine ? 1 : 0.3) : 1, transition: 'opacity 0.1s' }} />;
        })}
        {pitchAccent.map((item, i) => {
          const cx = i * colW + colW / 2;
          const cy = item.pitch === 1 ? highY : lowY;
          const isActive = i === activeMora;
          const isPast = activeMora >= 0 && i < activeMora;
          return (
            <g key={`c${i}`}>
              {isActive && (
                <circle cx={cx} cy={cy} r="12" fill="none" stroke="#ff3366" strokeWidth="2"
                  style={{ opacity: 0.4, animation: 'dotPulse 0.4s ease-out' }} />
              )}
              <circle cx={cx} cy={cy}
                r={isActive ? 7 : 5}
                fill="#ff3366"
                style={{
                  opacity: activeMora >= 0 ? (isActive ? 1 : isPast ? 0.5 : 0.3) : 1,
                  transition: 'opacity 0.1s',
                }}
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', width: totalW }}>
        {pitchAccent.map((item, i) => {
          const isActive = i === activeMora;
          const isPast = activeMora >= 0 && i < activeMora;
          return (
            <div key={i} style={{
              width: colW, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '1px',
              transition: 'opacity 0.1s',
              opacity: activeMora >= 0 ? (isActive ? 1 : isPast ? 0.5 : 0.35) : 1,
            }}>
              <span style={{
                fontSize: '15px', fontWeight: isActive ? '800' : '600',
                color: isActive ? '#ff3366' : '#000',
                lineHeight: 1.2, whiteSpace: 'nowrap',
                transition: 'color 0.1s',
              }}>{item.kana}</span>
              <span style={{
                fontSize: '9px', fontWeight: '500',
                color: isActive ? 'rgba(255,51,102,0.6)' : 'rgba(0,0,0,0.3)',
                lineHeight: 1, transition: 'color 0.1s',
              }}>{item.romaji}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes dotPulse {
          0% { r: 7; opacity: 0.6; }
          100% { r: 14; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export const HearTab = ({ word }) => {
  const [isPlaying, setIsPlaying] = useState(null);
  const [activeMora, setActiveMora] = useState(-1);
  const animFrameRef = useRef(null);

  const handlePlay = async (speed) => {
    if (isPlaying) return;
    setIsPlaying(speed);
    const rate = speed === 'superslow' ? 0.45 : speed === 'slow' ? 0.7 : 1.0;

    try {
      const audio = await playGoogleTTS(word.kanji, rate, word.hiragana);
      if (audio) {
        await new Promise(resolve => {
          if (audio.duration && audio.duration !== Infinity) resolve();
          else audio.addEventListener('loadedmetadata', resolve, { once: true });
        });

        const duration = audio.duration;
        const timings = word.pitchAccent ? getMoraTimings(word.pitchAccent, duration) : [];

        audio.play();
        const startTime = performance.now();

        if (timings.length > 0) {
          const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            let current = -1;
            for (let i = 0; i < timings.length; i++) {
              if (elapsed >= timings[i].start && elapsed < timings[i].start + timings[i].duration) {
                current = i;
                break;
              }
            }
            setActiveMora(current);
            if (elapsed < duration) {
              animFrameRef.current = requestAnimationFrame(animate);
            }
          };
          animFrameRef.current = requestAnimationFrame(animate);
        }

        audio.onended = () => {
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          setActiveMora(-1);
          setIsPlaying(null);
        };
        audio.onerror = () => {
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          setActiveMora(-1);
          setIsPlaying(null);
        };
        return;
      }
      console.warn('[HearTab] Google TTS failed, falling back to browser');
    } catch (err) {
      console.warn('[HearTab] Google TTS error:', err.message, '— falling back to browser');
    }

    const utterance = new SpeechSynthesisUtterance(word.hiragana || word.kanji);
    utterance.lang = 'ja-JP';
    utterance.rate = speed === 'superslow' ? 0.3 : speed === 'slow' ? 0.5 : 1.0;
    utterance.onend = () => setIsPlaying(null);
    utterance.onerror = () => setIsPlaying(null);
    speechSynthesis.speak(utterance);
  };

  useEffect(() => () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }, []);

  const detectPitchPattern = (pitchAccent) => {
    if (!pitchAccent || pitchAccent.length < 2) return { name: 'unknown', japanese: '不明', description: 'Pitch pattern could not be determined.' };
    const pitches = pitchAccent.map(p => p.pitch);
    const n = pitches.length;

    let dropAfter = -1;
    for (let i = 0; i < n - 1; i++) {
      if (pitches[i] === 1 && pitches[i + 1] === 0) { dropAfter = i; break; }
    }

    if (dropAfter === 0) {
      return { name: 'atamadaka', japanese: '頭高型', description: 'Starts high on the first mora, then drops and stays low. Emphasize the very first beat.' };
    }
    if (dropAfter === -1) {
      if (pitches[0] === 0) {
        return { name: 'heiban', japanese: '平板型', description: 'Starts low, rises after the first mora, and stays high — even when followed by a particle. Flat and even.' };
      }
      return { name: 'heiban', japanese: '平板型', description: 'Stays at a consistent pitch throughout.' };
    }
    if (dropAfter === n - 2) {
      if (pitches[0] === 0) {
        return { name: 'odaka', japanese: '尾高型', description: 'Starts low, rises, and stays high through the last mora — but drops when followed by a particle like は or が.' };
      }
    }
    if (dropAfter >= 1) {
      return { name: 'nakadaka', japanese: '中高型', description: `Starts low, rises, then drops after mora ${dropAfter + 1}. The pitch peaks in the middle of the word.` };
    }
    return { name: 'unknown', japanese: '不明', description: 'Pitch pattern could not be classified.' };
  };

  const pattern = detectPitchPattern(word.pitchAccent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: '#f8f8f8', borderRadius: '12px', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', overflow: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#888' }}>PITCH ACCENT</div>
        <PitchVisual pitchAccent={word.pitchAccent} activeMora={activeMora} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
        {['normal', 'slow', 'superslow'].map(speed => {
          const active = isPlaying === speed;
          const label = speed === 'superslow' ? '🐢🐢🐢' : speed === 'slow' ? 'Slow' : 'Listen';
          const icon = speed === 'superslow' ? null : speed === 'slow' ? <span style={{ fontSize: '14px' }}>🐢</span> : (
            active ? <span style={{ fontSize: '12px' }}>◼</span> : <svg width="14" height="14" viewBox="0 0 24 24" fill="#1a1a2e"><polygon points="6,3 20,12 6,21" /></svg>
          );
          return (
          <button key={speed} onClick={() => handlePlay(speed)}
            style={{
            background: active ? '#ffe600' : '#f0f0f0',
            color: '#1a1a2e',
            border: 'none',
            borderRadius: '12px', padding: '10px 20px',
            fontSize: '13px', fontWeight: '600', cursor: isPlaying ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.15s ease',
            opacity: isPlaying && !active ? 0.4 : 1,
            animation: active ? 'breathe 1.5s ease-in-out infinite' : 'none',
          }}>
            {icon}
            {label}
          </button>
          );
        })}
        </div>
      </div>
      <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#555', lineHeight: 1.5 }}>
        This word has a <strong>{pattern.name} pitch pattern</strong> ({pattern.japanese}). {pattern.description}
      </div>
      {word.pitchSource && (
        <div style={{ textAlign: 'center', fontSize: '10px', color: '#aaa' }}>
          {word.pitchSource === 'kanjium' ? '📚 Pitch data from Kanjium dictionary (Wadoku)' : '🤖 AI-generated pitch (may be inaccurate)'}
        </div>
      )}
      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export const KanjiTab = ({ word, onCaptureKanji }) => {
  const kanjiDetails = word.kanjiDetails || [];
  if (kanjiDetails.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
        <p style={{ fontSize: '14px', fontWeight: '600' }}>No kanji breakdown available yet</p>
        <p style={{ fontSize: '12px', marginTop: '8px' }}>Kanji details may still be loading</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {kanjiDetails.map((k, index) => (
        <button
          key={index}
          onClick={() => onCaptureKanji && onCaptureKanji(k.kanji, word.kanji)}
          style={{
            background: '#fff', border: '2px solid #e5e5e5', borderRadius: '16px',
            padding: '20px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: '20px',
            transition: 'all 0.15s ease',
            boxShadow: 'none'
          }}
          onMouseEnter={e => { e.currentTarget.style.border = '2px solid #000'; e.currentTarget.style.boxShadow = '3px 3px 0 #000'; e.currentTarget.style.transform = 'translate(-1px, -1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.border = '2px solid #e5e5e5'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
        >
          <div style={{
            fontSize: '52px', fontWeight: '400', color: '#000',
            fontFamily: "'Noto Serif JP', serif", lineHeight: 1,
            flexShrink: 0, width: '70px', textAlign: 'center'
          }}>
            {k.kanji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '15px', fontWeight: '600', color: '#000',
              fontFamily: "'Noto Serif JP', serif",
              marginBottom: '6px'
            }}>
              {k.meaning}
            </div>
            <div style={{ fontSize: '11px', color: '#999' }}>
              {k.strokeCount} strokes · Tap to learn this kanji
            </div>
          </div>
          <div style={{ fontSize: '18px', flexShrink: 0, color: '#ccc' }}>→</div>
        </button>
      ))}
    </div>
  );
};
