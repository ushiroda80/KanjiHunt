import React, { useState } from 'react';

const VOICE_TIPS = [
  { emoji: '🐢', text: 'Speak 2x <strong>slower</strong> than normal', sub: 'Voice capture works best with clear, deliberate speech' },
  { emoji: '🔴', text: 'Wait for the red or blue pulse before speaking', sub: 'The mic needs a moment to initialize' },
  { emoji: '📱', text: 'Hold the phone 6-8 inches from your mouth', sub: 'Too close or too far reduces accuracy' },
  { emoji: '🤫', text: 'Reduce background noise if possible', sub: 'Quiet environments dramatically improve recognition' },
  { emoji: '🔁', text: 'For short words, try saying it twice: "木、木"', sub: 'Repeating gives the recognizer more audio to work with' },
];

const VoiceTipModal = ({ onDismiss }) => {
  const [index, setIndex] = useState(0);
  const tip = VOICE_TIPS[index];

  return (
    <div onClick={onDismiss} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px', padding: '28px 24px',
        width: '85%', maxWidth: '300px', textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>{tip.emoji}</div>
        <div style={{ fontSize: '16px', color: '#1a1a1a', fontWeight: '500', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: tip.text }} />
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '8px' }}>{tip.sub}</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px' }}>
          {VOICE_TIPS.map((_, i) => (
            <div key={i} onClick={() => setIndex(i)} style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: i === index ? '#1a1a1a' : '#ddd',
              cursor: 'pointer', transition: 'background 0.15s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
          <button onClick={() => setIndex(i => (i - 1 + VOICE_TIPS.length) % VOICE_TIPS.length)} style={{
            background: 'transparent', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '8px',
            padding: '6px 16px', fontSize: '13px', cursor: 'pointer', color: 'rgba(0,0,0,0.5)',
          }}>←</button>
          <button onClick={onDismiss} style={{
            background: '#ffe600', border: '2px solid #1a1a1a', borderRadius: '10px',
            padding: '6px 24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '2px 2px 0 #1a1a1a',
          }}>Got it</button>
          <button onClick={() => setIndex(i => (i + 1) % VOICE_TIPS.length)} style={{
            background: 'transparent', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '8px',
            padding: '6px 16px', fontSize: '13px', cursor: 'pointer', color: 'rgba(0,0,0,0.5)',
          }}>→</button>
        </div>
      </div>
    </div>
  );
};

export default VoiceTipModal;
