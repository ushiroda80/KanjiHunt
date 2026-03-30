import React, { useState } from 'react';

const HistoryPage = ({ wordStore, dictionaryWords, onSelectWord, pinnedWords, onTogglePin }) => {
  const [filter, setFilter] = useState('all');

  const allWords = [];
  Object.keys(wordStore).forEach(key => {
    const w = wordStore[key];
    allWords.push({
      word: key,
      kanji: w.kanji || key,
      hiragana: w.hiragana || '',
      english: w.english || '',
      jlpt: w.jlpt || '?',
      capturedAt: w.capturedAt || new Date().toISOString(),
      pinned: pinnedWords && pinnedWords.has(w.kanji || key)
    });
  });

  allWords.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));

  const displayWords = filter === 'pinned' ? allWords.filter(w => w.pinned) : allWords;
  const pinnedCount = allWords.filter(w => w.pinned).length;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

  const sections = [];
  const today = [], yesterday = [], lastWeek = [], older = [];

  displayWords.forEach(w => {
    const d = new Date(w.capturedAt);
    if (d >= todayStart) today.push(w);
    else if (d >= yesterdayStart) yesterday.push(w);
    else if (d >= weekStart) lastWeek.push(w);
    else older.push(w);
  });

  if (today.length) sections.push({ label: 'Today', words: today });
  if (yesterday.length) sections.push({ label: 'Yesterday', words: yesterday });
  if (lastWeek.length) sections.push({ label: 'Last week', words: lastWeek });
  if (older.length) sections.push({ label: 'Older', words: older });

  const jlptColors = { 'N5': '#4ade80', 'N4': '#a3e635', 'N3': '#f59e0b', 'N2': '#f472b6', 'N1': '#ef4444' };

  return (
    <div style={{
      padding: '20px', paddingTop: '28px', paddingBottom: '100px', minHeight: '100vh',
      background: '#fafafa'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>History</h1>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'pinned'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
              border: 'none', cursor: 'pointer',
              background: filter === f ? '#1a1a2e' : '#f0f0f0',
              color: filter === f ? '#fff' : '#5f6368',
              transition: 'all 0.15s ease'
            }}>
              {f === 'all' ? `All (${allWords.length})` : `Starred (${pinnedCount})`}
            </button>
          ))}
        </div>
      </div>

      {displayWords.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '80px' }}>
          <div style={{ fontSize: '48px', opacity: 0.3 }}>{filter === 'pinned' ? '★' : '📋'}</div>
          <p style={{ marginTop: '16px', color: '#888', fontWeight: '600', fontSize: '15px' }}>
            {filter === 'pinned' ? 'No starred words yet' : 'No words captured yet'}
          </p>
          <p style={{ marginTop: '8px', color: '#bbb', fontSize: '13px' }}>
            {filter === 'pinned' ? 'Star words from the Learn view to save them here' : 'Captured words will appear here'}
          </p>
        </div>
      ) : (
        sections.map((section, si) => (
          <div key={section.label} style={{ marginBottom: si < sections.length - 1 ? '24px' : '0' }}>
            <div style={{
              fontSize: '11px', fontWeight: '700', color: '#999',
              letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px'
            }}>
              {section.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {section.words.map((w, i) => (
                <button
                  key={w.word + i}
                  onClick={() => onSelectWord(w.word)}
                  style={{
                    background: '#fff',
                    border: 'none',
                    borderRadius: '0',
                    borderBottom: '1px solid #f0f0f0',
                    padding: '12px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: '40%', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {w.hiragana && w.hiragana !== w.kanji && (
                      <span style={{ fontSize: '10px', color: 'rgba(0,0,0,0.65)', marginBottom: '1px' }}>{w.hiragana}</span>
                    )}
                    <span style={{ fontSize: '26px', fontWeight: '400', color: '#1a1a2e', fontFamily: "'Noto Serif JP', serif", lineHeight: 1.2 }}>{(() => { const k = w.kanji || w.word || ''; const chars = [...k]; return chars.length > 9 ? chars.slice(0, 9).join('') + '…' : k; })()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px', color: '#333', fontWeight: '500',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {w.english}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                      {w.jlpt && w.jlpt !== '?' && (
                        <span style={{
                          fontSize: '9px', fontWeight: '700', color: '#fff',
                          background: jlptColors[w.jlpt] || '#888',
                          padding: '1px 6px', borderRadius: '4px'
                        }}>
                          {w.jlpt}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); onTogglePin(w.kanji || w.word); }}
                    style={{ fontSize: '21px', color: w.pinned ? '#ffe600' : '#ddd', flexShrink: 0, cursor: 'pointer', padding: '4px' }}
                  >
                    {w.pinned ? '★' : '☆'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default HistoryPage;
