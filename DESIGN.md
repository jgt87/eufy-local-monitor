---
name: Eufy Local Monitor
description: A local camera monitor styled after the eufy app's OneAnker design system, in monochrome.
colors:
  page: "#f3f7fb"
  card: "#ffffff"
  ink: "#000f16"
  ink-secondary: "rgba(0, 15, 22, .66)"
  ink-tertiary: "rgba(0, 15, 22, .44)"
  fill: "rgba(0, 15, 22, .08)"
  stage: "#141414"
  error-ink: "#b2382f"
  error-fill: "rgba(240, 80, 73, .12)"
typography:
  family: '"MontForAnker", "Segoe UI Variable", "Segoe UI", sans-serif'
  display2: "28px / 600"
  display: "20px / 600"
  title1: "16px"
  body: "14px"
  caption2: "12px"
  caption1: "10px"
rounded:
  cell-icon: "12px"
  input: "12px"
  sidenav-item: "16px"
  group: "24px"
  pill: "1000px"
spacing:
  xs: "4px"
  s: "8px"
  m: "12px"
  l: "16px"
  xl: "20px"
  xxl: "24px"
  cell-height: "60px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  group:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.group}"
  cell:
    height: "{spacing.cell-height}"
    padding: "10px 16px"
---

# Design System: Eufy Local Monitor

## Source

The values come from the eufy 6.1.10 app itself, recovered in `analysis/ui` (open `Start UI Atlas.cmd`, then Design tokens): OneAnker `oa.bg`, `oa.fg` and `oa.fill` colours, `oa.radius` (group 24, input 16, pill 1000), `oa.padding`/`oa.gap` (4 … 24), the standard `oa.font` sizes, and the MontForAnker typeface. The eufy cyan brand colour (`#00CBEB`) is deliberately not used. Accents are the app's neutral ink tokens, so the interface stays monochrome.

## Look

- Pale blue-grey page (`#f3f7fb`) with white rounded groups (24 px), no borders or shadows.
- Lists are grouped cells, 60 px tall: a 40 px tinted icon tile, a 16 px title, a 12 px tertiary subtitle, and a value or chevron on the right. Cells are separated by hairlines inside the group.
- Buttons are pills. Primary is ink on white text; secondary is a translucent ink fill. Round 48 px icon buttons carry a caption below them, as in the eufy live screen.
- Live view uses a dark rounded stage. The camera name and state sit in a top gradient, and the controls go in a white card underneath: snapshot, the start/stop pill, and full screen.
- Mobile: main content comes first, devices and account below, and a fixed bottom tab bar (Cameras, APK findings) replaces the side navigation.
- Dark mode follows the system and uses the OneAnker dark values (black page, `#1a1e1f` cards, white ink).

## Truthful states

- Account state is plain text in the account card ("Not signed in", "Captcha required", "Signed in"). There are no coloured connection pills or status dots.
- Synthetic playback always shows the "TEST SIGNAL · NOT A CAMERA" stamp.
- Errors use a soft red fill with dismissal and `role="alert"`; it is the only non-neutral colour.

## Code layout

`src/styles/tokens.css` (tokens and fonts), `base.css`, `layout.css`, `components.css`; components in `src/components/`, polling and API in `src/hooks/useMonitor.js`.
