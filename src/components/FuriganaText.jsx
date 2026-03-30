import React from 'react';

const FuriganaText = ({ parts }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '1px', lineHeight: 1.2 }}>
    {parts.map((part, i) => {
      const showReading = part.reading && part.reading !== part.text;
      return (
        <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative', marginTop: showReading ? '14px' : '0' }}>
          {showReading && (
            <span style={{ fontSize: '10px', color: part.highlight ? '#ff3366' : 'rgba(0,0,0,0.5)', lineHeight: 1 }}>
              {part.reading}
            </span>
          )}
          <span style={{ fontSize: '18px', fontWeight: part.highlight ? '700' : '500', color: part.highlight ? '#ff3366' : '#000', lineHeight: 1.2 }}>
            {part.text}
          </span>
        </span>
      );
    })}
  </div>
);

export default FuriganaText;
