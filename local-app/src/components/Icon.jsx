const PATHS = {
  camera: <><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10 5-3v10l-5-3" /></>,
  play: <path d="m9 5 11 7-11 7Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2" /></>,
  link: <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  snapshot: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="m8 6 2-3h4l2 3" /><circle cx="12" cy="13" r="3" /></>,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  doorbell: <><rect x="7" y="2" width="10" height="20" rx="5" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="16" r="2.3" /></>,
  home: <><path d="m3 10 9-7 9 7v11H3Z" /><path d="M9 21v-7h6v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  check: <path d="m5 12 4 4L20 5" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  logout: <path d="M10 4H4v16h6m5-13 5 5-5 5m-7-5h12" />,
  devices: <><rect x="3" y="4" width="8" height="7" rx="2" /><rect x="13" y="4" width="8" height="7" rx="2" /><rect x="3" y="13" width="8" height="7" rx="2" /><rect x="13" y="13" width="8" height="7" rx="2" /></>,
  findings: <><path d="M7 3h7l5 5v13H7Z" /><path d="M14 3v5h5M10 13h6m-6 4h6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  motion: <><circle cx="13" cy="4.5" r="1.8" /><path d="m9 21 3-6 3 2v4m-6-9 2-4 4 1 2 4M11 8l-2 5" /></>,
  sliders: <><path d="M4 7h10m4 0h2M4 17h4m4 0h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};

export function Icon({ name, size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {PATHS[name] || PATHS.camera}
    </svg>
  );
}
