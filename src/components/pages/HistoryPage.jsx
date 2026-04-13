import React, { useState, useRef, useCallback } from 'react';

const DELETE_WIDTH = 80;
const SNAP_THRESHOLD = 50;

const SwipeableRow = ({ rowKey, children, isOpen, onOpen, onClose, onDelete }) => {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const directionLocked = useRef(false);
  const isHorizontal = useRef(false);
  const didDrag = useRef(false);
  const rowRef = useRef(null);

  const setTranslate = (x, animate) => {
    if (!rowRef.current) return;
    rowRef.current.style.transition = animate ? 'transform 0.2s ease' : 'none';
    rowRef.current.style.transform = `translateX(${x}px)`;
  };

  const handleStart = (clientX, clientY) => {
    // If another row is open, close it
    if (isOpen) {
      onClose();
      setTranslate(0, true);
      return;
    }
    startX.current = clientX;
    startY.current = clientY;
    currentX.current = 0;
    swiping.current = true;
    directionLocked.current = false;
    isHorizontal.current = false;
    didDrag.current = false;
  };

  const handleMove = (clientX, clientY) => {
    if (!swiping.current) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;

    if (!directionLocked.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      directionLocked.current = true;
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    if (!directionLocked.current || !isHorizontal.current) return;

    didDrag.current = true;

    // Only allow left swipe (negative dx), cap at -DELETE_WIDTH
    const clamped = Math.min(0, Math.max(-DELETE_WIDTH, dx));
    currentX.current = clamped;
    setTranslate(clamped, false);
  };

  const handleEnd = () => {
    if (!swiping.current) return;
    swiping.current = false;

    if (!isHorizontal.current) {
      setTranslate(0, true);
      return;
    }

    if (currentX.current < -SNAP_THRESHOLD) {
      setTranslate(-DELETE_WIDTH, true);
      onOpen(rowKey);
    } else {
      setTranslate(0, true);
    }
  };

  // Snap open/closed when isOpen changes externally
  const prevOpen = useRef(isOpen);
  if (prevOpen.current !== isOpen) {
    prevOpen.current = isOpen;
    if (!isOpen && rowRef.current) setTranslate(0, true);
    if (isOpen && rowRef.current) setTranslate(-DELETE_WIDTH, true);
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Delete button behind the row */}
      <div
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: DELETE_WIDTH + 'px',
          background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        Delete
      </div>
      {/* Swipeable row content */}
      <div
        ref={rowRef}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onClick={(e) => { if (didDrag.current) { e.stopPropagation(); e.preventDefault(); } }}
        style={{ position: 'relative', background: '#fff', userSelect: 'none' }}
      >
        {children}
      </div>
    </div>
  );
};

const HistoryPage = ({ wordStore, wordsLoading, dictionaryWords, onSelectWord, pinnedWords, onTogglePin, onDeleteWord }) => {
  const [filter, setFilter] = useState('all');
  const [openRow, setOpenRow] = useState(null);

  if (wordsLoading) {
    return (
      <div style={{ padding: '20px', paddingBottom: '100px', minHeight: '100vh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}/>
          <p style={{ marginTop: '12px', fontSize: '13px' }}>Loading your words…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

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
      pinned: pinnedWords && pinnedWords.has(key)
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
    }} onClick={() => setOpenRow(null)}>
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
                <SwipeableRow
                  key={w.word + i}
                  rowKey={w.word + i}
                  isOpen={openRow === w.word + i}
                  onOpen={(key) => setOpenRow(key)}
                  onClose={() => setOpenRow(null)}
                  onDelete={() => { setOpenRow(null); onDeleteWord(w.word); }}
                >
                  <button
                    onClick={() => { if (openRow === w.word + i) { setOpenRow(null); return; } onSelectWord(w.word); }}
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
                      onClick={(e) => { e.stopPropagation(); onTogglePin(w.word); }}
                      style={{ fontSize: '21px', color: w.pinned ? '#ffe600' : '#ddd', flexShrink: 0, cursor: 'pointer', padding: '4px' }}
                    >
                      {w.pinned ? '★' : '☆'}
                    </div>
                  </button>
                </SwipeableRow>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default HistoryPage;
