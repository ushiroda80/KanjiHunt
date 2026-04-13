import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'firebase/auth';
import { firebaseAuth } from './config/firebase';
import { getStoredDefaultLang, setStoredDefaultLang } from './lib/storage';
import { callCloudFunction, getWords, saveWord, updateWordField, deleteWords } from './lib/api';
import { WordStore } from './lib/wordStore';
import CapturePage from './components/pages/CapturePage';
import ViewPage from './components/pages/ViewPage';
import HistoryPage from './components/pages/HistoryPage';
import SettingsPage from './components/pages/SettingsPage';
import AdminPage from './components/pages/AdminPage';
import BottomNav from './components/BottomNav';

const App = () => {
  console.log('[Kanji Hunt] v3.3.8 loaded');
  const [activeSection, setActiveSection] = useState('capture');
  const [captureResetKey, setCaptureResetKey] = useState(0);
  const [capturedWord, setCapturedWord] = useState(null);
  const [wordData, setWordData] = useState(null);
  const [wordStore, setWordStore] = useState({});
  const [wordsLoading, setWordsLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultLang, setDefaultLang] = useState(() => getStoredDefaultLang());
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [usage, setUsage] = useState(null);
  const pinnedWords = useMemo(() => {
    const s = new Set();
    Object.entries(wordStore).forEach(([k, w]) => { if (w.pinned) s.add(k); });
    return s;
  }, [wordStore]);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await callCloudFunction('getUsage', {});
      setUsage(data);
      console.log('[Usage]', data);
    } catch (e) {
      console.warn('[Usage] Failed to fetch:', e.message);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (user) {
        console.log(`🔑 Auth: signed-in as ${user.uid} (${user.email}) → fetching words...`);
        fetchUsage();
        setWordsLoading(true);
        const expectedUid = user.uid;
        getWords().then(words => {
          if (firebaseAuth.currentUser?.uid !== expectedUid) {
            console.warn(`🔑 Auth: discarding getWords result — user changed (was ${expectedUid}, now ${firebaseAuth.currentUser?.uid})`);
            return;
          }
          const keys = Object.keys(words);
          console.log(`🔑 Auth: getWords returned ${keys.length} words for ${user.uid} (${user.email})`);
          console.log(`📦 Firestore returned: [${keys.slice(0, 10).join(', ')}${keys.length > 10 ? `, ... +${keys.length - 10} more` : ''}]`);
          setWordStore(words);
          setWordsLoading(false);
        }).catch((e) => {
          if (firebaseAuth.currentUser?.uid !== expectedUid) return;
          console.error(`🔑 Auth: getWords FAILED for ${user.uid}:`, e.message);
          setWordsLoading(false);
        });
      } else {
        console.log('🔑 Auth: signed-out → clearing wordStore');
        setWordStore({});
        setWordsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [fetchUsage]);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(firebaseAuth, provider);
    } catch (error) {
      console.error('[Auth] Sign-in failed:', error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(firebaseAuth, provider);
        } catch (redirectError) {
          console.error('[Auth] Redirect sign-in also failed:', redirectError);
        }
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      console.error('[Auth] Sign-out failed:', error);
    }
  };

  const togglePin = (word) => {
    const isPinned = pinnedWords.has(word);
    setWordStore(prev => ({ ...prev, [word]: { ...prev[word], pinned: !isPinned } }));
    updateWordField(word, { pinned: !isPinned });
  };

  const handleSaveDefaultLang = (lang) => {
    setDefaultLang(lang);
    setStoredDefaultLang(lang);
  };

  const handleCapture = async (word, sourceContext, captureContext) => {
    word = word.trim().replace(/[。．.、,\s]+$/, '');
    const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(word);
    if (hasJapanese) word = word.replace(/\s+/g, '');

    // Build capture context for audit logging
    const ctx = captureContext || {};
    if (!ctx.inputLang) ctx.inputLang = hasJapanese ? 'ja' : 'en';

    console.log('[handleCapture] Word: "' + word + '"' + (sourceContext ? ' (from: ' + sourceContext + ')' : '') + ` [${ctx.inputLang}]`);
    setCapturedWord(word);
    setActiveSection('view');

    const { data, source } = WordStore.get(word, wordStore);

    if (data) {
      setWordData(data);
      const updatedData = { ...data, capturedAt: new Date().toISOString() };
      setWordStore(prev => ({ ...prev, [word]: updatedData }));
      const saveUid = firebaseAuth.currentUser?.uid;
      console.log(`💾 saveWord("${word}") as ${saveUid} (${firebaseAuth.currentUser?.email}) [existing]`);
      saveWord(word, updatedData);
      console.log(`Word "${word}" loaded from ${source} (timestamp updated)`);
    } else {
      setIsLoading(true);
      console.log(`Fetching data for "${word}"...`);

      const fullData = await WordStore.fetchOrCreateWord(word, (partialWord) => {
        setWordData(partialWord);
        setIsLoading(false);
        console.log(`Core data for "${word}" ready — showing card`);
      }, sourceContext, ctx);

      setWordData(fullData);
      setIsLoading(false);

      setWordStore(prev => ({ ...prev, [word]: fullData }));
      const saveUid2 = firebaseAuth.currentUser?.uid;
      console.log(`💾 saveWord("${word}") as ${saveUid2} (${firebaseAuth.currentUser?.email}) [new]`);
      saveWord(word, fullData);

      console.log(`Word "${word}" fully loaded`);
      fetchUsage();
    }
  };

  const handleNewCapture = () => {
    setCapturedWord(null);
    setWordData(null);
    setActiveSection('capture');
  };

  const handleDeleteUnpinned = () => {
    const unpinned = Object.keys(wordStore).filter(k => !wordStore[k].pinned);
    const newStore = {};
    Object.keys(wordStore).forEach(k => { if (wordStore[k].pinned) newStore[k] = wordStore[k]; });
    setWordStore(newStore);
    if (unpinned.length > 0) deleteWords(unpinned);
  };

  const handleDeleteWord = (word) => {
    const newStore = { ...wordStore };
    delete newStore[word];
    setWordStore(newStore);
    deleteWords([word]);
  };

  const handleSelectFromHistory = (word) => {
    const { data } = WordStore.get(word, wordStore);
    if (data) {
      setCapturedWord(word);
      setWordData(data);
      setActiveSection('view');
    }
  };

  useEffect(() => {
    console.log('Word Store:', wordStore);
    console.log('Stored words:', Object.keys(wordStore));
    console.log('Auth:', firebaseUser ? firebaseUser.email : 'not signed in');
  }, [wordStore, firebaseUser]);

  if (authLoading) {
    return (
      <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}/>
          <p style={{ marginTop: '16px', fontSize: '14px' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const isAdmin = firebaseUser && firebaseUser.email === 'ushiroda80@gmail.com';

  return (
    <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100vh', background: '#fff', position: 'relative' }}>

      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}

      {showSettings && (
        <SettingsPage
          defaultLang={defaultLang}
          onSaveDefaultLang={handleSaveDefaultLang}
          onClose={() => setShowSettings(false)}
          wordStore={wordStore}
          pinnedWords={pinnedWords}
          onDeleteUnpinned={handleDeleteUnpinned}
          firebaseUser={firebaseUser}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          usage={usage}
          isAdmin={isAdmin}
          onOpenAdmin={() => { setShowSettings(false); setShowAdmin(true); }}
        />
      )}

      {activeSection === 'capture' && (
        firebaseUser
          ? <CapturePage key={captureResetKey} onCapture={handleCapture} defaultLang={defaultLang} usage={usage} isAdmin={isAdmin} />
          : <div style={{ padding: '24px', paddingBottom: '100px', minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '48px' }}>🔒</span>
                <p style={{ marginTop: '16px', fontWeight: '600', color: '#fff', fontSize: '16px' }}>Sign in to start capturing</p>
                <p style={{ marginTop: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Use your Google account</p>
                <button onClick={handleSignIn} style={{ marginTop: '20px', background: '#ffe600', border: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Sign in with Google</button>
              </div>
            </div>
      )}
      {activeSection === 'history' && <HistoryPage wordStore={wordStore} wordsLoading={wordsLoading} onSelectWord={handleSelectFromHistory} pinnedWords={pinnedWords} onTogglePin={togglePin} onDeleteWord={handleDeleteWord} />}
      {activeSection === 'view' && (wordData || isLoading) && <ViewPage word={wordData} onNewCapture={handleNewCapture} onCaptureKanji={handleCapture} isLoading={isLoading} onRetry={() => capturedWord && handleCapture(capturedWord)} isPinned={wordData && pinnedWords.has(wordData.kanji)} onTogglePin={togglePin} isAdmin={isAdmin} />}
      {activeSection === 'view' && !wordData && !isLoading && (
        <div style={{ padding: '24px', paddingBottom: '100px', minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#888' }}>
            <span style={{ fontSize: '48px' }}>📖</span>
            <p style={{ marginTop: '16px', fontWeight: '600' }}>No word captured yet</p>
            <button onClick={handleNewCapture} style={{ marginTop: '16px', background: '#ffe600', border: '3px solid #000', borderRadius: '12px', padding: '12px 24px', fontWeight: '700', cursor: 'pointer' }}>Capture a word</button>
          </div>
        </div>
      )}
      {activeSection === 'practice' && (
        <div style={{ padding: '24px', paddingBottom: '100px', minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#888' }}><span style={{ fontSize: '48px' }}>⚔️</span><p style={{ marginTop: '16px', fontWeight: '600' }}>Practice coming soon</p></div>
        </div>
      )}
      {activeSection === 'collection' && (
        <div style={{ padding: '24px', paddingBottom: '100px', minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#888' }}><span style={{ fontSize: '48px' }}>📚</span><p style={{ marginTop: '16px', fontWeight: '600' }}>Collection coming soon</p></div>
        </div>
      )}
      <BottomNav activeSection={activeSection} onSectionChange={(id) => {
        if (id === 'settings') { setShowSettings(true); return; }
        if (id === 'capture') setCaptureResetKey(k => k + 1);
        setActiveSection(id);
      }} />
    </div>
  );
};

export default App;
