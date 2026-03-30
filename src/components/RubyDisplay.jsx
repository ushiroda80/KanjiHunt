import React from 'react';

const RubyDisplay = ({ rubyParts, kanji, hiragana, fontSize }) => {
  const size = fontSize || 68;
  const rubySize = Math.max(11, Math.round(size * 0.2));

  if (rubyParts && rubyParts.length > 0) {
    return (
      <div style={{
        color: '#000', fontSize: `${size}px`, fontWeight: '400', lineHeight: 1.2,
        fontFamily: "'Noto Serif JP', serif", textAlign: 'center',
        rubyPosition: 'over'
      }}>
        {rubyParts.map((part, i) => (
          part.ruby ? (
            <ruby key={i} style={{ rubyAlign: 'center' }}>
              {part.base}
              <rp>(</rp>
              <rt style={{ fontSize: `${rubySize}px`, fontWeight: '400', color: 'rgba(0,0,0,0.5)', fontFamily: '-apple-system, sans-serif' }}>
                {part.ruby}
              </rt>
              <rp>)</rp>
            </ruby>
          ) : (
            <span key={i}>{part.base}</span>
          )
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: `${rubySize}px`, fontWeight: '400', marginBottom: '2px' }}>{hiragana}</div>
      <div style={{ color: '#000', fontSize: `${size}px`, fontWeight: '400', lineHeight: 1, fontFamily: "'Noto Serif JP', serif" }}>{kanji}</div>
    </div>
  );
};

export default RubyDisplay;
