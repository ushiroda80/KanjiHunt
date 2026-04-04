import React, { useState } from 'react';
import RubyDisplay from './RubyDisplay';
import { tagExplanations } from './Tags';
import { DefineTab, ExamplesTab, HearTab, KanjiTab } from './Tabs';
import TabLoading from './TabLoading';

const tabs = [
  { id: 'define', label: 'Define' },
  { id: 'examples', label: 'Examples' },
  { id: 'hear', label: 'Hear' },
  { id: 'kanji', label: 'Kanji' }
];

const JlptBadge = ({ jlpt, color }) => {
  const [isHovered, setIsHovered] = useState(false);
  const explanation = tagExplanations[jlpt] || 'JLPT level unknown.';
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
    >
      <div style={{ background: color, color: '#fff', fontSize: '9px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'default' }}>{jlpt || '?'}</div>
      {isHovered && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: '8px', background: '#1a1a2e', color: '#fff', fontSize: '11px',
          lineHeight: 1.4, padding: '10px 12px', borderRadius: '8px', width: '200px',
          zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', textAlign: 'center', whiteSpace: 'normal'
        }}>
          {explanation}
          <div style={{
            position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent', borderBottom: '6px solid #1a1a2e'
          }}/>
        </div>
      )}
    </div>
  );
};

const WordCard = ({ word, onCaptureKanji, isPinned, onTogglePin, isAdmin }) => {
  const [activeTab, setActiveTab] = useState('define');
  const [showPinToast, setShowPinToast] = useState(false);
  const [showRubyDebug, setShowRubyDebug] = useState(false);
  const prevPinned = React.useRef(isPinned);

  React.useEffect(() => {
    if (isPinned && !prevPinned.current) {
      setShowPinToast(true);
      const t = setTimeout(() => setShowPinToast(false), 1200);
      return () => clearTimeout(t);
    }
    prevPinned.current = isPinned;
  }, [isPinned]);

  const jlptBadgeColors = { 'N5': '#4ade80', 'N4': '#a3e635', 'N3': '#f59e0b', 'N2': '#f472b6', 'N1': '#ef4444' };
  const jlptBadgeColor = jlptBadgeColors[word.jlpt] || '#888';

  const charCount = [...(word.kanji || '')].length;
  const displayKanji = charCount > 12 ? [...word.kanji].slice(0, 12).join('') + '…' : word.kanji;
  const kanjiSize = charCount <= 4 ? 68 : charCount <= 6 ? 48 : charCount <= 8 ? 38 : charCount <= 12 ? 30 : 28;

  return (
    <div style={{
      width: '100%', maxWidth: '460px',
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '12px',
        position: 'relative',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
      }}>
        <JlptBadge jlpt={word.jlpt} color={jlptBadgeColor} />
        {isAdmin && <div
          onClick={() => setShowRubyDebug(!showRubyDebug)}
          style={{
            position: 'absolute', top: '-1px', left: '21px', zIndex: 10,
            width: '14px', height: '22px',
            background: showRubyDebug ? '#888' : '#fff',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
        />}
        {onTogglePin && (
          <React.Fragment>
          <div
            onClick={() => onTogglePin(word.kanji)}
            style={{
              position: 'absolute', top: '8px', right: '12px', zIndex: 10,
              fontSize: '22px',
              color: isPinned ? '#ffe600' : '#ddd',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
              filter: isPinned ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' : 'none'
            }}
            title={isPinned ? 'Unstar word' : 'Star word'}
          >
            {isPinned ? '★' : '☆'}
          </div>
          {showPinToast && (
            <div style={{
              position: 'absolute', top: '10px', right: '40px', zIndex: 11,
              background: '#1a1a2e', color: '#fff', fontSize: '10px', fontWeight: '700',
              padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px',
              animation: 'pinToastFade 1.2s ease-out forwards',
              pointerEvents: 'none',
            }}>Starred</div>
          )}
          </React.Fragment>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <RubyDisplay rubyParts={word.rubyParts} kanji={displayKanji} hiragana={word.hiragana} fontSize={kanjiSize} />
          {isAdmin && showRubyDebug && (
            <div style={{
              position: 'absolute', top: '100%', left: '0', right: '0', zIndex: 20,
              background: '#1a1a1a', borderRadius: '8px', padding: '10px',
              fontSize: '10px', fontFamily: 'monospace', color: '#4ade80', lineHeight: 1.6,
              maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#ffe600', fontWeight: '700' }}>Ruby Debug</span>
                <button onClick={() => setShowRubyDebug(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '11px' }}>✕</button>
              </div>
              <div style={{ color: '#888' }}>kanji: "{word.kanji}"</div>
              <div style={{ color: '#888' }}>hiragana: "{word.hiragana}"</div>
              <div style={{ color: '#888', marginBottom: '4px' }}>rubyParts: {word.rubyParts ? word.rubyParts.length + ' parts' : 'null'}</div>
              {word.rubyParts && word.rubyParts.map((p, i) => (
                <div key={i} style={{ color: p.ruby ? '#4ade80' : '#888' }}>
                  [{i}] base: "{p.base}" {p.ruby ? `→ ruby: "${p.ruby}"` : '(no ruby)'}
                </div>
              ))}
              {!word.rubyParts && <div style={{ color: '#f87171' }}>No rubyParts — using fallback display</div>}
            </div>
          )}
          <div style={{ color: 'rgba(0,0,0,0.4)', fontSize: '13px', marginTop: '6px', fontFamily: 'monospace', fontWeight: '400' }}>{word.romaji}</div>
          <div style={{ color: '#000', fontSize: '18px', fontWeight: '600', textAlign: 'center', marginTop: '12px' }}>{word.english}</div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: '16px', borderBottom: '1px solid #e8e8e8' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, background: 'none',
            color: activeTab === tab.id ? '#1a1a2e' : '#5f6368',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #ffe600' : '2px solid transparent',
            padding: '10px 8px', fontSize: '12px', fontWeight: activeTab === tab.id ? '700' : '600',
            cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.15s ease'
          }}>{tab.label}</button>
        ))}
      </div>
      <div style={{ padding: '16px 0', minHeight: '280px' }}>
        <div style={{ display: activeTab === 'define' ? 'block' : 'none' }}>
          <DefineTab word={word} />
        </div>
        <div style={{ display: activeTab === 'examples' ? 'block' : 'none' }}>
          {word.isPartial ? <TabLoading label="Loading examples..." /> : <ExamplesTab word={word} />}
        </div>
        <div style={{ display: activeTab === 'hear' ? 'block' : 'none' }}>
          {word.isPartial ? <TabLoading label="Loading pitch data..." /> : <HearTab word={word} />}
        </div>
        <div style={{ display: activeTab === 'kanji' ? 'block' : 'none' }}>
          {word.isPartial ? <TabLoading label="Loading kanji details..." /> : <KanjiTab word={word} onCaptureKanji={onCaptureKanji} />}
        </div>
      </div>
    </div>
  );
};

export default WordCard;
