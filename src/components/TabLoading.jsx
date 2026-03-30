import React, { useState, useEffect } from 'react';

const TabLoading = ({ label }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '16px' }}>
      <div style={{
        width: '32px', height: '32px', border: '3px solid rgba(0,0,0,0.1)',
        borderTopColor: '#ff3366', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}/>
      <p style={{ fontSize: '13px', color: '#999', fontWeight: '600' }}>{label}</p>
      <p style={{ fontSize: '11px', color: '#ccc' }}>{elapsed}s</p>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default TabLoading;
