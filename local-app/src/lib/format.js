export const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const day = value => {
  const d = new Date(value); const today = new Date(); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
};
export const bytes = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

// Only the selected country is remembered; storage can be unavailable (private windows).
export const safeStorage = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

export const ACCOUNT_LABELS = {
  'signed-out': 'Not signed in', 'signing-in': 'Signing in…', captcha: 'Captcha required', 'two-factor': 'Verification required',
  expired: 'Session expired', error: 'Sign-in failed', connected: 'Signed in',
};
