import React from 'react';

const BottomNav = ({ activeSection, onSectionChange }) => {
  const navItems = [
    { id: 'capture', label: 'Capture', icon: (active) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={active ? '#1a1a2e' : '#5f6368'} strokeWidth="2"/><circle cx="12" cy="12" r="3" fill={active ? '#1a1a2e' : '#5f6368'}/></svg> },
    { id: 'view', label: 'Learn', icon: (active) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#1a1a2e' : '#5f6368'} strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> },
    { id: 'practice', label: 'Practice', icon: (active) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#1a1a2e' : '#5f6368'} strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
    { id: 'history', label: 'History', icon: (active) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#1a1a2e' : '#5f6368'} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> },
    { id: 'settings', label: 'Settings', icon: (active) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#1a1a2e' : '#5f6368'} strokeWidth="1.5"><path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.98l2.11-1.65a.49.49 0 00.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/></svg> },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff',
      boxShadow: '0 -1px 3px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'center',
      padding: '0 4px', height: '68px', zIndex: 100
    }}>
      <div style={{ display: 'flex', width: '100%', maxWidth: '430px', alignItems: 'stretch' }}>
      {navItems.map(item => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            style={{
              flex: 1, background: 'none', border: 'none',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '2px',
              cursor: 'pointer', padding: 0
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '48px', height: '26px', borderRadius: '13px',
              background: isActive ? '#ffe600' : 'transparent',
              transition: 'background 0.2s'
            }}>
              {item.icon(isActive)}
            </div>
            <span style={{
              fontSize: '11px', fontWeight: isActive ? 700 : 500,
              color: isActive ? '#1a1a2e' : '#5f6368'
            }}>{item.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
};

export default BottomNav;
