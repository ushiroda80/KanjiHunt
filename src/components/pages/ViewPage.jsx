import React from 'react';
import { firebaseAuth } from '../../config/firebase';
import WordCard from '../WordCard';

const ViewPage = ({ word, onNewCapture, onCaptureKanji, isLoading, onRetry, isPinned, onTogglePin, isAdmin }) => (
  <div style={{
    padding: '16px', paddingTop: '24px', paddingBottom: '100px', minHeight: '100vh',
    background: '#fafafa',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '0'
  }}>
    {isLoading ? (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '60px', height: '60px', border: '4px solid rgba(0,0,0,0.1)',
          borderTopColor: '#1a1a2e', borderRadius: '50%',
          animation: 'spin 1s linear infinite', margin: '0 auto'
        }}/>
        <p style={{ marginTop: '24px', color: '#5f6368', fontSize: '16px', fontWeight: '600' }}>
          Looking up word...
        </p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    ) : (
      <>
        {word && word.isPlaceholder && (
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '14px', padding: '14px 18px', width: '100%', maxWidth: '360px',
            display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px'
          }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#b91c1c' }}>
              {!firebaseAuth.currentUser ? '⚠️ Not signed in' : '⚠️ Failed to load word data'}
            </p>
            <p style={{ fontSize: '11px', color: '#991b1b', lineHeight: 1.4 }}>
              {!firebaseAuth.currentUser
                ? 'Sign in via Settings to fetch word data.'
                : 'The API call failed. Try again.'}
            </p>
            {firebaseAuth.currentUser && onRetry && (
              <button onClick={onRetry} style={{
                background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px',
                padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                alignSelf: 'flex-start', marginTop: '4px'
              }}>Retry</button>
            )}
          </div>
        )}
        {word && <WordCard word={word} onCaptureKanji={onCaptureKanji} isPinned={isPinned} onTogglePin={onTogglePin} isAdmin={isAdmin} />}
      </>
    )}
  </div>
);

export default ViewPage;
