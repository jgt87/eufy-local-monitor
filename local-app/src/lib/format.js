export const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
