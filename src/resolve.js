import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative } from 'node:path';

/** Load package.json scripts from root, or null if there is no package.json. */
export function loadScripts(root) {
  const p = join(root, 'package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')).scripts ?? {};
  } catch (e) {
    throw new Error(`cannot parse ${p}: ${e.message}`);
  }
}

/**
 * Returns an error string if the reference does not resolve, else null.
 * Paths are resolved relative to `root` and may not escape it.
 */
export function resolveRef(ref, root, scripts) {
  if (ref.kind === 'script') {
    if (scripts === null) return `script:${ref.target} — no package.json in ${root}`;
    return Object.hasOwn(scripts, ref.target) ? null : `script:${ref.target} — not defined in package.json`;
  }
  const target = ref.target;
  if (isAbsolute(target)) return `${ref.kind}:${target} — path must be relative to the repo root`;
  const rel = relative(root, join(root, normalize(target)));
  if (rel.startsWith('..')) return `${ref.kind}:${target} — path escapes the repo root`;
  return existsSync(join(root, rel)) ? null : `${ref.kind}:${target} — file not found`;
}
