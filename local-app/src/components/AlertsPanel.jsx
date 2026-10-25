import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { Switch } from './Switch.jsx';

const FIRST = ['doorbellPress', 'personDetected', 'strangerDetected', 'motion', 'packageDelivered'];

// Which rings and detections raise an alert on this PC. Windows shows them as notifications, also with
// no browser open; elsewhere the open page plays a chime.
export function AlertsPanel({ alerts, api, act, busy }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  if (!alerts) return null;
  const save = change => act('alerts', () => api('alerts', change));
  const kinds = [...FIRST, ...Object.keys(alerts.labels).filter(k => !FIRST.includes(k))];
  const on = kinds.filter(k => alerts.kinds[k]).map(k => alerts.labels[k]);
  const test = () => act('alerts-test', async () => { setSent(false); await api('alerts/test'); setSent(true); });
  return (
    <section className="panel" aria-label="Alerts on this PC">
      <div className="panel-heading"><h2>Alerts on this PC</h2></div>
      <div className="group">
        <div className="cell static">
          <span className="cell-copy"><strong>{alerts.available ? 'Windows notifications' : 'Alerts in this page'}</strong><small>{alerts.available ? 'Shown even when the browser is closed. Click one to open Events.' : 'Shown while this page is open.'}</small></span>
          <Switch label="Alerts" checked={alerts.desktop} disabled={!!busy} onChange={desktop => save({ desktop })} />
        </div>
        <div className="cell static">
          <span className="cell-copy"><strong>Sound</strong><small>{alerts.available ? 'The Windows notification sound; a ring uses the reminder sound.' : 'A short chime.'}</small></span>
          <Switch label="Alert sound" checked={alerts.sound} disabled={!!busy || !alerts.desktop} onChange={sound => save({ sound })} />
        </div>
        <button className="cell" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="cell-copy"><strong>Alert me for</strong><small>{on.length ? on.join(', ') : 'Nothing selected'}</small></span>
          <Icon name="chevron" size={18} className={open ? 'chevron open' : 'chevron'} />
        </button>
        {open && kinds.map(k => (
          <div key={k} className="cell static sub">
            <span className="cell-copy"><strong>{alerts.labels[k]}</strong></span>
            <Switch label={alerts.labels[k]} checked={!!alerts.kinds[k]} disabled={!!busy || !alerts.desktop} onChange={v => save({ kinds: { [k]: v } })} />
          </div>
        ))}
      </div>
      {alerts.available && (
        <div className="clear-row">
          <button className="text-button" disabled={!!busy} onClick={test}>Send a test notification</button>
          {sent && <span role="status">Sent. If nothing appeared, check that notifications are on for Windows PowerShell in Windows Settings.</span>}
        </div>
      )}
    </section>
  );
}
