# Mobile app interface: UI atlas

Offline reconstruction of the eufy 6.1.10 (30612) Android interface from `APKDownload/`. Nothing was installed, executed or connected to an account or device. The APKs are only read.

Start it with `Start UI Atlas.cmd` in the project root, or run `node analysis/ui/atlas/serve.mjs` and open <http://127.0.0.1:4291/ui/atlas/>.

## What is recovered

| Source | Recovered | How |
| --- | --- | --- |
| 10 security React Native bundles (`feature_asset_pack.apk`) | 6,330 app source files with original paths, 974 screens/modals, 4,850 components with element trees | Hermes v96 bytecode: Metro `__d(factory, "path", deps)` table, then symbolic evaluation of compiled `jsx()` calls |
| Text in 38 languages | Per-bundle `res/language/<code>.js` tables (English 182–3,517 keys per bundle, 10,855 in all) for English plus 37 other languages; 35,017 native `strings.xml` strings, English only (`config.en.apk` is the only language split); per-feature i18n proxies such as `MotionText.activity_zone` | Object literals in the language modules, `{t: key}` tables behind `new Proxy(...)` |
| Design tokens | bc-rnuikit `defColor` (50), aiot-sdk `UFColor` (94), OneAnker `oa` semantic (55), OneAnker primitives (174), type scale XXXS 8 … XXXL 24, radius scale | Getter classes `get darker() { return this.color({fixedFG, darkFG, fixedBG, darkBG}) }` and `new DynamicValue(light, dark)` |
| Images | 3,000+ RN asset modules mapped to their packaged drawables, image loaders with light/dark variants | `__packager_asset` records → Android resource names |
| Fonts | MontForAnker Regular/SemiBold/Bold/Heavy | `assets/fonts` in the asset pack |
| Native Android screens | 4,273 layout XML files rendered in the browser, 3,800+ drawables (vector → SVG, shape → CSS), day/night colours | Decoded base APK resources (`analysis/decoded`) |

Smoke test result (all bundles, light and dark): all 963 screens and modals render without exceptions. Plain `.ts` files (view models named `*ViewModal.ts`, the `BCRNDialog.ts` native wrapper) and `use*` hooks count as logic, not screens, and re-export files such as `PresentPositionsScreen.tsx` preview the screen they re-export (`alias` in the catalogue).

## Screen map and T8214 variants

- **Screen map** (`#/map`, `#/map/<bundle>`, `#/map/<bundle>/<index>`): which files open which screens, from the catalogue's `navigates` field. A link is a screen name in the file's strings, or a route name from the bundle's route registry (`NavigationConfig` route tables, `<Stack.Screen name component>` elements) when the file imports `NavigationKeys` or the name ends in Screen/Page. The registries themselves are left out. The per-screen page draws callers and targets as a graph; nodes open their own graph.
- **T8214 variants** (`#/t8214`, a "T8214" tag and a "T8214 only" filter in the bundle lists): files that reference the T8214 doorbell model (`isT8214` checks, `'T8214'` literals, T8214 text keys), or import a view model or hook of the same feature that calls `isT8214`. For these checks only, `rn-tree.mjs` follows the conditional jump: elements built between the check and its target are tagged `$c: ["T8214"]` (or `["!T8214"]` for the else side). Elements of a branch that the straight-line evaluation overwrote before the return are kept per component as `branches`. The screen page marks branch elements, filters them with the model selector (all, T8214, other models) and lists the branch trees in the tree selector.

## Text search and preview language

- **Preview language** (header): previews, the Text panel and the search render text in the chosen language; the choice is kept in `localStorage`. The RN bundles ship their own tables for ar, cs, da, de, es, et, fi, fil, fr, he, hr, hu, id, it, ja, kk, ko, lt, lv, ms, nb, nl, pl, pt, ro, ru, sk, sl, sq, sr-BA, sv, th, tr, uk, vi, zh-CN and zh-Hant, but not every bundle has every language (et, fil, he, lt, lv, sk and uk only in SEC_ADDDEVICE). Keys a table lacks keep the English text, and native strings are always English. Regional files fill in for the plain code where a bundle has no plain file (de-DE → de, es-LA → es, tr-TR → tr, pt-BR/pt-PT → pt, zh-TW → zh-Hant, ja-JP → ja, he-IL → he). The percentage in the selector counts strings that differ from English: some tables, such as MEGA_PLAYER `nl`, are mostly English.
- **Text search** (header box, `#/search/<query>`): matches file names, raw text keys and the texts in the preview language. Every word must occur in the file; a screen or modal also matches through the components it imports directly. The index (`atlas/data/search.json`) lists per file the keys of its tree (translate() keys, i18n proxy entries) and its strings that are language keys; the browser resolves them per language on first use.

## Compare versions

Every build writes a manifest of its APK set to `atlas/data/versions/<version>.json` (version from the base APK name, `Anker_eufy-6.1.10_30612.apk` → `6.1.10-30612`): per bundle and source path the kind, a tree hash that ignores function ids and minified component names, text keys, T8214 references and branch labels, routes and navigation targets, plus the English language tables. `versions/index.json` lists the manifests and which one the atlas data belongs to.

To compare with another version, put that APK set (base APK plus `feature_asset_pack.apk`) in its own folder, for example `APKDownload-6.2.0/`, and build it:

```
node analysis/ui/tools/build-all.mjs --apk APKDownload-6.2.0
node analysis/ui/tools/diff-versions.mjs                       # the two newest builds
node analysis/ui/tools/diff-versions.mjs 6.1.10-30612 6.2.0-31000 --all --json diff.json
```

The APK folder is only read. Work files go to `analysis/ui/versions/<version>/` (`--out` picks another folder, `--version` another label); the main atlas data is left as it is, only the manifest is added. Native resources (`analysis/decoded`) belong to the main APK set, so another version has none unless `--res <decoded res dir>` is given; the manifest does not depend on them. The atlas page `#/diff` (`#/diff/<old>/<new>`) shows added, removed and changed screens (optionally components), changed T8214 tags and changed strings, with links into the atlas data; with a single manifest it explains these steps. `tools/diff-versions.mjs` and the page share `atlas/js/version-diff.js`.

## Reading the previews

- Control flow is not followed, except for T8214 model checks (see above). Every conditional branch appears at once; loops render one sample. Use the "Returned tree" selector when a component has several `return` paths.
- Runtime data is absent: device names, events, list contents. Values from props/state render as `{name}`. Lists render once per static data entry, or three template rows (the 2nd and 3rd dimmed) when the data is built at runtime.
- Dashed boxes are components that could not be resolved, mostly native views such as `BCRNP2PImageView` (live frames), `Video`, maps and `highlightText`.
- Dimension tokens are recovered: `UFSpace` (4, 6, 8, 12, 16, 18, 20, 24, 30), `UFRadius` (2 … 25), `UFFont` sizes (8 … 24), and the OneAnker `oa.padding` / `oa.gap` (0 … 24), `oa.radius` (with aliases such as `btn` = pill and `dialog` = 24) and `oa.line`. Each scale class has fixed/relative and ratio variants; the previews use fixed, which comes from the first class in each factory. For `oa.font`, the `standard` brand table is shown, because the app picks the brand at runtime.
- Two colour systems coexist: the older bc-rnuikit blue brand (`#005D8E`, dark `#008CD6`) and the current OneAnker cyan brand (`#00CBEB`). Most current screens use the OneAnker tokens.
- The main app shell (home tab, device list, bottom navigation) is Jetpack Compose inside the protected DEX. It is not recoverable statically and is not shown.
- Native layouts are linked to screens by file name only, because their controller code is protected. RelativeLayout and ConstraintLayout are approximated as vertical stacks.

## Layout

```
analysis/ui/
  tools/        build-all.mjs (whole pipeline, --apk for another APK set), hbc.mjs (bytecode reader), hbc-modules.mjs,
                rn-tree.mjs (element trees), theme-tokens.mjs, build-atlas-data.mjs (atlas JSON + version manifest),
                diff-versions.mjs (compare two manifests), apk-version.mjs
  rn/           unpacked RN bundles (bytecode + drawables), regenerated by build-all
  modules/      Metro module tables per bundle
  trees/        recovered element trees, constant tables, theme getters
  fonts/        MontForAnker fonts
  atlas/        the viewer: index.html, css/, js/ (views, rn-render.js, native-render.js), data/, serve.mjs
  atlas/test/   shots.mjs (screenshots), smoke.mjs (render every screen)
  versions/     work files of other APK sets built with --apk
```

## Rebuild and test

```
node analysis/ui/tools/build-all.mjs
node analysis/ui/atlas/serve.mjs 4291
```

Tests use the Playwright copy in `local-app/node_modules` with installed Edge:

```
set PLAYWRIGHT_MODULE_URL=file:///<repo>/local-app/node_modules/playwright/index.mjs
node analysis/ui/atlas/test/smoke.mjs
node analysis/ui/atlas/test/shots.mjs <out-dir> "#/b/SEC_SETTING/190" "#/tokens" "#/map" "#/t8214"
```

The smoke test also renders every file with a T8214 reference in both model variants and each separated branch tree, then checks the text search (English and Dutch), the language switch and its persistence across a reload, the `#/diff` page, and the diff of a synthetic copy of the current manifest. `ATLAS_LANG=nl` makes `shots.mjs` set the preview language first.

From Git Bash, set `MSYS_NO_PATHCONV=1` first, otherwise `#/...` routes are rewritten as Windows paths.

## Evidence limits

These are static reconstructions, not screenshots of the running app. Layout is approximated by mapping RN styles to CSS flexbox at 1 px = 1 dp on a 360 dp wide frame. A screen's real appearance also depends on runtime state, feature flags, device model and native views that are not part of the bundles.
