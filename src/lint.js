import { readFileSync } from 'node:fs';
import { findRules } from './parse.js';
import { loadScripts, resolveRef } from './resolve.js';

/**
 * Lint instruction files. Returns { problems, rules } where each problem is
 * { file, line, code, message } and code is one of: untagged, dangling, malformed.
 */
export function lintFiles(files, { root = process.cwd(), ...parseOpts } = {}) {
  const scripts = loadScripts(root);
  const problems = [];
  const rules = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const rule of findRules(text, parseOpts)) {
      rules.push({ file, ...rule });
      const at = { file, line: rule.line };
      for (const err of rule.tagErrors) problems.push({ ...at, code: 'malformed', message: err });
      if (!rule.tags.length && !rule.tagErrors.length) {
        problems.push({ ...at, code: 'untagged', message: `rule "${rule.text}" has no enforced-by or unenforced tag` });
      }
      for (const tag of rule.tags) {
        if (tag.type !== 'enforced-by') continue;
        for (const ref of tag.refs) {
          const err = resolveRef(ref, root, scripts);
          if (err) problems.push({ ...at, code: 'dangling', message: `rule "${rule.text}": ${err}` });
        }
      }
    }
  }
  return { problems, rules };
}

export function summarize(rules) {
  let enforced = 0, unenforced = 0, untagged = 0;
  for (const r of rules) {
    const types = new Set(r.tags.map((t) => t.type));
    if (types.has('enforced-by')) enforced++;
    else if (types.has('unenforced')) unenforced++;
    else untagged++;
  }
  return { total: rules.length, enforced, unenforced, untagged };
}
