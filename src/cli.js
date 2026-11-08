import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { lintFiles, summarize } from './lint.js';

export const DEFAULT_FILES = [
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.windsurfrules',
  '.github/copilot-instructions.md',
];

const HELP = `rule-lint — every rule in an agent instruction file must declare how it is enforced.

Usage: rule-lint [options] [files...]

With no files, checks whichever of these exist under --root:
  ${DEFAULT_FILES.join(', ')}, .cursor/rules/*.mdc

Each rule needs an HTML comment on the next line:
  <!-- enforced-by: test:<path>, script:<npm-script>, workflow:<path>, hook:<path>, doc:<path> -->
  <!-- unenforced: <reason> -->

Options:
  --root <dir>            Repo root for resolving references (default: cwd)
  --heading-levels <a-b>  Heading levels treated as rules (default: 2-6)
  --no-headings           Only bolded lines are rules
  --no-bold               Only headings are rules
  --format <text|json>    Output format (default: text)
  -q, --quiet             Print problems only, no summary
  -h, --help              Show this help

Exit codes: 0 ok, 1 problems found, 2 usage error.`;

export function parseArgs(argv) {
  const o = { files: [], root: process.cwd(), headingLevels: [2, 6], headings: true, bold: true, format: 'text', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--root': o.root = resolve(val()); break;
      case '--heading-levels': {
        const m = /^([1-6])-([1-6])$/.exec(val());
        if (!m || +m[1] > +m[2]) throw new UsageError('--heading-levels expects e.g. 2-6');
        o.headingLevels = [+m[1], +m[2]];
        break;
      }
      case '--no-headings': o.headings = false; break;
      case '--no-bold': o.bold = false; break;
      case '--format': o.format = val(); if (!['text', 'json'].includes(o.format)) throw new UsageError('--format must be text or json'); break;
      case '-q': case '--quiet': o.quiet = true; break;
      default:
        if (a.startsWith('-')) throw new UsageError(`unknown option ${a}`);
        o.files.push(a);
    }
  }
  return o;
}

export class UsageError extends Error {}

export function discover(root) {
  const found = DEFAULT_FILES.map((f) => join(root, f)).filter((p) => existsSync(p));
  const cursorDir = join(root, '.cursor', 'rules');
  if (existsSync(cursorDir)) {
    for (const f of readdirSync(cursorDir).sort()) if (f.endsWith('.mdc')) found.push(join(cursorDir, f));
  }
  return found;
}

/** Runs the CLI; returns an exit code. `out`/`err` are injectable for tests. */
export function run(argv, { out = console.log, err = console.error } = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) { err(`rule-lint: ${e.message}\n\n${HELP}`); return 2; }
    throw e;
  }
  if (o.help) { out(HELP); return 0; }

  const files = o.files.length ? o.files.map((f) => resolve(f)) : discover(o.root);
  if (!files.length) { err('rule-lint: no instruction files found (pass paths explicitly)'); return 2; }
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) { err(`rule-lint: file not found: ${missing.join(', ')}`); return 2; }

  let result;
  try {
    result = lintFiles(files, o);
  } catch (e) {
    err(`rule-lint: ${e.message}`);
    return 2;
  }
  const { problems, rules } = result;
  const stats = summarize(rules);
  const show = (f) => relative(process.cwd(), f) || f;

  if (o.format === 'json') {
    out(JSON.stringify({ stats, problems: problems.map((p) => ({ ...p, file: show(p.file) })) }, null, 2));
  } else {
    for (const p of problems) out(`${show(p.file)}:${p.line}: ${p.code}: ${p.message}`);
    if (!o.quiet) {
      out(`\n${stats.total} rule(s): ${stats.enforced} enforced, ${stats.unenforced} unenforced, ${stats.untagged} untagged. ${problems.length} problem(s).`);
    }
  }
  return problems.length ? 1 : 0;
}
