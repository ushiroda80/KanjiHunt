import React, { useState } from 'react';

export const tagExplanations = {
  'N1': 'JLPT N1 — advanced vocabulary for fluent speakers.',
  'N2': 'JLPT N2 — upper intermediate vocabulary.',
  'N3': 'JLPT N3 — intermediate vocabulary, ~1-2 years study.',
  'N4': 'JLPT N4 — basic vocabulary, ~6 months study.',
  'N5': 'JLPT N5 — beginner vocabulary.'
};

export const contextExplanations = {
  daily: {
    0: 'Not appropriate for casual speech.',
    1: 'Usable but slightly formal for casual speech.',
    2: 'Natural in everyday conversation.',
    3: 'Natural in everyday conversation.'
  },
  media: {
    0: 'Not typical in entertainment media.',
    1: 'Might appear in some anime or TV.',
    2: 'Fits naturally in anime, manga, TV.',
    3: 'Fits naturally in anime, manga, TV.'
  },
  business: {
    0: 'Not suitable for workplace settings.',
    1: 'Acceptable but informal for work.',
    2: 'Appropriate in professional settings.',
    3: 'Appropriate in professional settings.'
  },
  academic: {
    0: 'Not suited for formal writing.',
    1: 'Acceptable in some formal contexts.',
    2: 'Appropriate for academic writing.',
    3: 'Appropriate for academic writing.'
  }
};

export const Tag = ({ label, color, explanation, small }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          background: color,
          color: '#fff',
          fontSize: small ? '9px' : '10px',
          fontWeight: '800',
          padding: small ? '4px 10px' : '5px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          display: 'inline-block',
          boxShadow: isHovered ? '0 4px 8px rgba(0,0,0,0.2)' : 'none'
        }}
      >
        {label}
      </span>
      {isHovered && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: '8px', background: '#1a1a2e', color: '#fff', fontSize: '11px',
          lineHeight: 1.4, padding: '10px 12px', borderRadius: '8px', width: '180px',
          zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent', borderBottom: '6px solid #1a1a2e'
          }}/>
          {explanation}
        </div>
      )}
    </div>
  );
};

export const ContextTag = ({ context, usageLevel }) => {
  const [isHovered, setIsHovered] = useState(false);
  const labels = { daily: 'Daily', media: 'Media', business: 'Business', academic: 'Academic' };
  const text = labels[context];
  const explanation = contextExplanations[context]?.[usageLevel] || '';

  const styles = {
    3: { bg: '#ecfdf5', border: '#34d399', color: 'rgba(0,0,0,0.85)', fontWeight: '600' },
    2: { bg: '#f0fdf4', border: '#b5e8c9', color: 'rgba(0,0,0,0.55)', fontWeight: '500' },
    1: { bg: '#f9fafb', border: '#d1d5db', color: 'rgba(0,0,0,0.5)', fontWeight: '500' },
    0: { bg: '#f5f5f5', border: '#e8b4b4', color: 'rgba(180,100,100,0.35)', fontWeight: '500' }
  };
  const s = styles[usageLevel] || styles[0];

  return (
    <div style={{ position: 'relative' }}>
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          background: s.bg,
          border: `1.5px solid ${s.border}`,
          borderRadius: '20px',
          padding: '4px 12px',
          fontSize: '10px',
          fontWeight: s.fontWeight,
          color: s.color,
          cursor: 'default',
          display: 'inline-block',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap'
        }}
      >
        {text}
      </span>
      {isHovered && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '8px', background: '#1a1a2e', color: '#fff', fontSize: '11px',
          lineHeight: 1.4, padding: '10px 12px', borderRadius: '8px', width: '180px',
          zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', textAlign: 'center'
        }}>
          {explanation}
          <div style={{
            position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent', borderTop: '6px solid #1a1a2e'
          }}/>
        </div>
      )}
    </div>
  );
};
