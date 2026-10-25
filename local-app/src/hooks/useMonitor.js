import { useEffect, useRef, useState } from 'react';

// Polls the local server state and exposes token-authenticated API calls.
export function useMonitor() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const tokenRef = useRef('');

  const refresh = async () => {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('The local server is unavailable.');
    const data = await response.json();
    tokenRef.current = data.token;
    setState(data);
    return data;
  };

  useEffect(() => {
    let mounted = true;
    let timer;
    const poll = async () => {
      try { if (mounted) await refresh(); } catch { if (mounted) setError('The local server is unavailable. Run Start Monitor.cmd, then reload this page.'); }
      if (mounted) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { mounted = false; clearTimeout(timer); };
  }, []);

  const api = async (route, data = {}) => {
    const res = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Monitor-Token': tokenRef.current }, body: JSON.stringify(data) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'The request failed.');
    return json;
  };

  const act = async (label, fn) => {
    setBusy(label);
    setError('');
    try { await fn(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return { state, error, setError, busy, api, act };
}
