import { build } from 'esbuild';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
await mkdir('dist/fonts', { recursive: true });
await build({entryPoints:['src/main.jsx'],bundle:true,outdir:'dist',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,sourcemap:true,logLevel:'info',external:['/fonts/*']});
await copyFile('index.html','dist/index.html');
// MontForAnker comes from the APK (extracted by analysis/ui/tools/build-all.mjs); without it the CSS falls back to Segoe UI.
const fonts = path.join('..', 'analysis', 'ui', 'fonts');
try { for (const f of (await readdir(fonts)).filter(f => /^MontForAnker-(Regular|SemiBold|Bold)\.ttf$/.test(f))) await copyFile(path.join(fonts, f), path.join('dist/fonts', f)); }
catch { console.warn('MontForAnker fonts not found in analysis/ui/fonts; using system fonts.'); }
