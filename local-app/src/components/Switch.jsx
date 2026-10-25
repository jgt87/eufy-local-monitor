// The app's toggle (UFSwitch), monochrome: the track fills with ink when on.
export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
