import { Icon } from './Icon.jsx';
import { ACCOUNT_LABELS } from '../lib/format.js';
import { Switch } from './Switch.jsx';

const COUNTRIES = [['NL', 'Netherlands'], ['BE', 'Belgium'], ['DE', 'Germany'], ['GB', 'United Kingdom'], ['FR', 'France'], ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia']];

export function AccountCard({ account, sdkReady, stateLoaded, busy, form, onLogin, onChallenge, onSignout }) {
  const connected = account.status === 'connected';
  const challenge = ['captcha', 'two-factor'].includes(account.status);
  return (
    <section className="panel" aria-label="Eufy account">
      <div className="panel-heading"><h2>Eufy account</h2></div>
      <div className="group account-card">
        <div className="account-row">
          <span className="avatar"><Icon name="user" size={20} /></span>
          <span className="cell-copy">
            <strong>{connected ? 'Eufy account' : 'Sign in'}</strong>
            <small>{ACCOUNT_LABELS[account.status] || 'Not signed in'}</small>
          </span>
        </div>
        {connected ? (
          <>
            <p className="note">Your devices are loaded. Choose a camera to start viewing.</p>
            {account.remembered && <p className="note">The sign-in is saved on this PC, so the monitor signs in by itself when it starts. Sign out to remove it.</p>}
            <button className="pill secondary wide" disabled={!!busy} onClick={onSignout}><Icon name="logout" size={16} />Sign out</button>
          </>
        ) : (
          <>
            {!sdkReady && stateLoaded && <p className="notice">SDK setup needed. Run <code>npm.cmd install</code> in the app folder, then restart.</p>}
            {challenge ? (
              <form onSubmit={onChallenge}>
                <p className="note">{account.status === 'captcha' ? 'Enter the characters shown by Eufy.' : 'Enter the verification code Eufy sent you.'}</p>
                {account.challenge?.image && <img className="captcha" src={account.challenge.image} alt="Eufy sign-in captcha" />}
                <label htmlFor="answer">{account.status === 'captcha' ? 'Captcha answer' : 'Verification code'}</label>
                <input id="answer" autoComplete="one-time-code" value={form.answer} onChange={e => form.setAnswer(e.target.value)} required />
                <button className="pill primary wide" disabled={!!busy}>Verify</button>
                <button className="text-button" type="button" onClick={onSignout} disabled={!!busy}>Cancel sign-in</button>
              </form>
            ) : (
              <form onSubmit={onLogin}>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="username" value={form.email} onChange={e => form.setEmail(e.target.value)} placeholder="you@example.com" required />
                <label htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" value={form.password} onChange={e => form.setPassword(e.target.value)} placeholder="Eufy account password" required />
                <label htmlFor="country">Account country</label>
                <select id="country" value={form.country} onChange={e => form.setCountry(e.target.value)}>
                  {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <div className="remember-row">
                  <span id="remember-label">Keep me signed in on this PC</span>
                  <Switch label="Keep me signed in on this PC" checked={form.remember} onChange={form.setRemember} />
                </div>
                <button className="pill primary wide" disabled={!!busy || !sdkReady}>{busy === 'login' ? 'Signing in…' : 'Sign in to Eufy'}<Icon name="arrow" size={17} /></button>
                {['error', 'expired'].includes(account.status) && <button className="text-button" type="button" onClick={onSignout} disabled={!!busy}>Reset sign-in</button>}
              </form>
            )}
            <small className="fine-print">Connects to Eufy’s cloud and your devices. Your password is never stored; “Keep me signed in” saves only the session, encrypted for your Windows account.</small>
          </>
        )}
      </div>
    </section>
  );
}
