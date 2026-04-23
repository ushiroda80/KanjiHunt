import React, { useState } from 'react';
import { getTipsEnabled, setTipsEnabled, getTipsPermanentlyDismissed, setTipsPermanentlyDismissed, setTipTriggerCount, getStreamingSTTEnabled, setStreamingSTTEnabled } from '../../lib/storage';
import { getPitchDBMeta, getJlptDBMeta, getReadingsDBMeta, importPitchDB } from '../../lib/databases';

const SettingsPage = ({ defaultLang, onSaveDefaultLang, onClose, wordStore, pinnedWords, onDeleteUnpinned, firebaseUser, onSignIn, onSignOut, usage, isAdmin, onOpenAdmin }) => {
  const [selectedLang, setSelectedLang] = useState(defaultLang);
  const [tipsOn, setTipsOn] = useState(() => getTipsEnabled() && !getTipsPermanentlyDismissed());
  const [streamingOn, setStreamingOn] = useState(() => getStreamingSTTEnabled());
  const [saved, setSaved] = useState(false);

  const pitchMeta = getPitchDBMeta();
  const jlptMeta = getJlptDBMeta();
  const readingsMeta = getReadingsDBMeta();

  const SRow = ({ icon, iconColor, label, sub, right, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', gap: '12px', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: iconColor || '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a2e' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{sub}</div>}
        {children}
      </div>
      {right}
    </div>
  );

  const SGroup = ({ label }) => (
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '20px', marginBottom: '8px', paddingLeft: '4px' }}>{label}</div>
  );

  const SCard = ({ children }) => (
    <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>{children}</div>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#fafafa', zIndex: 200, overflowY: 'auto',
      padding: '20px 20px 100px'
    }}>
      <div style={{ maxWidth: '430px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: '600', color: '#5f6368', cursor: 'pointer', padding: '8px' }}>Done</button>
        </div>
        <div style={{ fontSize: '11px', color: '#bbb', marginBottom: '16px' }}>Kanji Hunt v3.3.14 · Hatake Development</div>

        <SGroup label="Preferences" />
        <SCard>
          <SRow icon="💡" iconColor="#fef3c7" label="Voice Tips" sub="Show tips when voice recognition struggles"
            right={
              <div onClick={() => { const v = !tipsOn; setTipsOn(v); setTipsEnabled(v); if (v) { setTipsPermanentlyDismissed(false); setTipTriggerCount(0); } }} style={{
                width: '44px', height: '26px', borderRadius: '13px', cursor: 'pointer',
                background: tipsOn ? '#4ade80' : '#ddd', position: 'relative', transition: 'background 0.2s', flexShrink: 0
              }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '2px', transition: 'left 0.2s',
                  left: tipsOn ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }}/>
              </div>
            }
          />
          {isAdmin && <SRow icon="🎙️" iconColor="#e0e7ff" label="Streaming STT" sub="Lower latency voice capture (requires AudioWorklet)"
            right={
              <div onClick={() => { const v = !streamingOn; setStreamingOn(v); setStreamingSTTEnabled(v); }} style={{
                width: '44px', height: '26px', borderRadius: '13px', cursor: 'pointer',
                background: streamingOn ? '#4ade80' : '#ddd', position: 'relative', transition: 'background 0.2s', flexShrink: 0
              }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '2px', transition: 'left 0.2s',
                  left: streamingOn ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }}/>
              </div>
            }
          />}
        </SCard>

        <SGroup label="Account" />
        <SCard>
          {firebaseUser ? (
            <SRow icon="👤" iconColor="#d1fae5" label={firebaseUser.displayName || firebaseUser.email} sub={firebaseUser.email}
              right={<button onClick={onSignOut} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Sign Out</button>}
            />
          ) : (
            <SRow icon="🔒" iconColor="#fee2e2" label="Not signed in" sub="Sign in to use voice and word lookup"
              right={<button onClick={onSignIn} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#ffe600', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Sign In</button>}
            />
          )}
        </SCard>

        {usage && firebaseUser && (
          <>
            <SGroup label="Usage" />
            <SCard>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f0f0f0" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke={usage.used >= usage.limit ? '#E24B4A' : '#ffe600'} strokeWidth="3"
                    strokeDasharray="97.4"
                    strokeDashoffset={97.4 - (97.4 * Math.min(usage.used, usage.limit) / usage.limit)}
                    strokeLinecap="round" transform="rotate(-90 18 18)"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>
                    {usage.used} <span style={{ fontSize: '12px', fontWeight: '500', color: '#888' }}>/ {usage.limit}</span>
                  </div>
                  <div style={{ height: '4px', background: '#f0f0f0', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '4px', borderRadius: '2px', width: Math.min(100, usage.used / usage.limit * 100) + '%', background: usage.used >= usage.limit ? '#E24B4A' : '#ffe600' }}/>
                  </div>
                </div>
              </div>
              <div style={{ padding: '0 16px 12px' }}>
                <div style={{ fontSize: '10px', color: '#bbb' }}>
                  {usage.used} captures this month, {Math.max(0, usage.limit - usage.used)} remaining
                </div>
              </div>
            </SCard>
          </>
        )}

        {isAdmin && <><SGroup label="Databases" />
        <SCard>
          <SRow icon="📚" iconColor={pitchMeta ? '#d1fae5' : '#f0f0f0'} label="Pitch Accent" sub={pitchMeta ? `${pitchMeta.count.toLocaleString()} words loaded` : 'Not loaded'}
            right={pitchMeta
              ? <span style={{ fontSize: '12px', color: '#166534' }}>✅</span>
              : <button onClick={async () => {
                  try {
                    const resp = await fetch('https://raw.githubusercontent.com/ushiroda80/KanjiHunt/main/data/accents.txt');
                    if (!resp.ok) throw new Error('File not found');
                    const text = await resp.text();
                    if (text.trim().startsWith('{')) {
                      const db = JSON.parse(text);
                      const count = Object.keys(db).length;
                      localStorage.setItem('wordHunter_pitchDB', text);
                      localStorage.setItem('wordHunter_pitchDB_meta', JSON.stringify({ count, importedAt: new Date().toISOString() }));
                      alert(`Loaded ${count.toLocaleString()} entries!`);
                    } else {
                      const count = importPitchDB(text);
                      alert(`Loaded ${count.toLocaleString()} entries!`);
                    }
                    setSaved(s => !s);
                  } catch (e) { alert('Load failed: ' + e.message); }
                }} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#ffe600', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Load</button>
            }
          />
          <SRow icon="🏷️" iconColor={jlptMeta ? '#d1fae5' : '#f0f0f0'} label="JLPT Levels" sub={jlptMeta ? `${jlptMeta.count.toLocaleString()} entries loaded` : 'Not loaded'}
            right={jlptMeta
              ? <span style={{ fontSize: '12px', color: '#166534' }}>✅</span>
              : <button onClick={async () => {
                  try {
                    const resp = await fetch('https://raw.githubusercontent.com/ushiroda80/KanjiHunt/main/data/jlpt_lookup.json');
                    if (!resp.ok) throw new Error('File not found');
                    const text = await resp.text();
                    const db = JSON.parse(text);
                    const count = Object.keys(db).length;
                    localStorage.setItem('wordHunter_jlptDB', JSON.stringify(db));
                    localStorage.setItem('wordHunter_jlptDB_meta', JSON.stringify({ count, importedAt: new Date().toISOString() }));
                    alert(`Loaded ${count.toLocaleString()} entries!`);
                    setSaved(s => !s);
                  } catch (e) { alert('Load failed: ' + e.message); }
                }} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#ffe600', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Load</button>
            }
          />
          <SRow icon="📖" iconColor={readingsMeta ? '#d1fae5' : '#f0f0f0'} label="Kanji Readings" sub={readingsMeta ? `${readingsMeta.count.toLocaleString()} kanji loaded` : 'Not loaded'}
            right={readingsMeta
              ? <span style={{ fontSize: '12px', color: '#166534' }}>✅</span>
              : <button onClick={async () => {
                  try {
                    const resp = await fetch('https://raw.githubusercontent.com/ushiroda80/KanjiHunt/main/data/readings.json');
                    if (!resp.ok) throw new Error('File not found');
                    const text = await resp.text();
                    const db = JSON.parse(text);
                    const count = Object.keys(db).length;
                    localStorage.setItem('wordHunter_readingsDB', JSON.stringify(db));
                    localStorage.setItem('wordHunter_readingsDB_meta', JSON.stringify({ count, importedAt: new Date().toISOString() }));
                    alert(`Loaded ${count.toLocaleString()} entries!`);
                    setSaved(s => !s);
                  } catch (e) { alert('Load failed: ' + e.message); }
                }} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#ffe600', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Load</button>
            }
          />
        </SCard></>}

        <SGroup label="Data" />
        <SCard>
          <SRow icon="🗑️" iconColor="#fee2e2" label="Delete Unpinned Words" sub={`Keep ${pinnedWords.size} pinned, remove the rest`}
            right={<button onClick={() => { if (confirm('Delete all unpinned words?')) onDeleteUnpinned(); }} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Delete</button>}
          />
        </SCard>

        {isAdmin && (
          <>
            <SGroup label="Admin" />
            <SCard>
              <SRow icon="👑" iconColor="#fef3c7" label="Admin Dashboard" sub="View all users and stats"
                right={<button onClick={onOpenAdmin} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', background: '#ffe600', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Open</button>}
              />
            </SCard>
          </>
        )}

        <SGroup label="About" />
        <SCard>
          <div style={{ padding: '12px 16px', fontSize: '10px', color: '#999', lineHeight: 1.8 }}>
            <p><strong>Pitch Accent:</strong> Kanjium (CC BY-SA 4.0)</p>
            <p><strong>Word Data:</strong> Claude API (Anthropic)</p>
            <p><strong>TTS/STT:</strong> Google Cloud</p>
          </div>
        </SCard>

      </div>
    </div>
  );
};

export default SettingsPage;
