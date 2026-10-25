// Version label of an APK set from its base APK file name (Anker_eufy-6.1.10_30612.apk -> 6.1.10-30612),
// falling back to the folder name. Shared by build-all.mjs and build-atlas-data.mjs.
import fs from 'node:fs';
import path from 'node:path';

export function apkVersion(dir, override) {
  const m = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => /(\d+(?:\.\d+)+)[_-](\d+)\.apk$/i.exec(f)).find(Boolean) : null;
  const version = m?.[1] ?? null, build = m ? Number(m[2]) : null;
  const id = override || (m ? `${version}-${build}` : path.basename(path.resolve(dir)));
  if (!/^[\w.-]+$/.test(id)) throw new Error(`Version label "${id}" may only contain letters, digits, dot, dash and underscore; pass --version <label>.`);
  return { id, version, build };
}
