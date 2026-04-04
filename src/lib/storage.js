// ============================================
// STORAGE HELPERS — localStorage wrappers
// ============================================

// Capture language preference
export const getStoredDefaultLang = () => localStorage.getItem('wordHunter_defaultLang') || 'ja';
export const setStoredDefaultLang = (lang) => localStorage.setItem('wordHunter_defaultLang', lang);

// Tip state helpers
const TIP_KEYS = {
  triggerCount: 'wordHunter_tipTriggerCount',
  lifetimeCaptures: 'wordHunter_lifetimeCaptures',
  permanentDismiss: 'wordHunter_tipsDismissed',
  tipsEnabled: 'wordHunter_tipsEnabled',
};

export function getTipTriggerCount() { return parseInt(localStorage.getItem(TIP_KEYS.triggerCount) || '0'); }
export function setTipTriggerCount(n) { localStorage.setItem(TIP_KEYS.triggerCount, String(n)); }
export function getLifetimeCaptures() { return parseInt(localStorage.getItem(TIP_KEYS.lifetimeCaptures) || '0'); }
export function incLifetimeCaptures() { const n = getLifetimeCaptures() + 1; localStorage.setItem(TIP_KEYS.lifetimeCaptures, String(n)); return n; }
export function getTipsPermanentlyDismissed() { return localStorage.getItem(TIP_KEYS.permanentDismiss) === 'true'; }
export function setTipsPermanentlyDismissed(v) { localStorage.setItem(TIP_KEYS.permanentDismiss, String(v)); }
export function getTipsEnabled() { const v = localStorage.getItem(TIP_KEYS.tipsEnabled); return v === null ? true : v === 'true'; }
export function setTipsEnabled(v) { localStorage.setItem(TIP_KEYS.tipsEnabled, String(v)); }

// Streaming STT preference (default: true — streaming is the default for cloudSTT users)
export function getStreamingSTTEnabled() { const v = localStorage.getItem('wordHunter_streamingSTT'); return v === null ? true : v === 'true'; }
export function setStreamingSTTEnabled(v) { localStorage.setItem('wordHunter_streamingSTT', String(v)); }
