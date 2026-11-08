// Rule detection and tag parsing for agent instruction files.
//
// Heuristic (documented in README):
//   1. Lines inside fenced code blocks (``` or ~~~) and HTML comments are ignored.
//   2. A "bold rule" is any line whose text (after optional list marker / blockquote)
//      starts with **bold** or __bold__, e.g. `- **Never commit secrets.**`.
//   3. A heading (levels 2-6 by default; H1 is the document title) is a rule only if it
//      is a *leaf*: its section, up to the next heading of the same or higher level,
//      contains no bold rules and no sub-headings. Headings that group rules are containers.
//   4. The tag(s) must be HTML comments on the line(s) immediately following the rule.
//      Several consecutive comment lines are allowed (e.g. enforced-by + unenforced).

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const BOLD_RULE = /^\s*(?:>\s*)*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)(\S.*?)(?:\*\*|__)/;
const COMMENT_LINE = /^\s*<!--(.*?)-->\s*$/;
const TAG = /^\s*(enforced-by|unenforced)\s*:\s*(.*?)\s*$/i;

export const KINDS = ['test', 'script', 'workflow', 'hook', 'doc'];

/**
 * @param {string} text
 * @param {{ headingLevels?: [number, number], headings?: boolean, bold?: boolean }} [opts]
 * @returns {Array<{ line: number, kind: 'heading'|'bold', text: string, tags: Tag[], tagErrors: string[] }>}
 */
export function findRules(text, opts = {}) {
  const { headingLevels = [2, 6], headings = true, bold = true } = opts;
  const lines = text.split(/\r?\n/);
  const live = maskIgnored(lines);

  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (!live[i]) continue;
    const h = HEADING.exec(lines[i]);
    if (h) {
      candidates.push({ i, kind: 'heading', level: h[1].length, text: stripMd(h[2]) });
      continue;
    }
    const b = BOLD_RULE.exec(lines[i]);
    if (b) candidates.push({ i, kind: 'bold', text: stripMd(b[1]) });
  }

  const rules = [];
  candidates.forEach((c, idx) => {
    if (c.kind === 'heading') {
      if (!headings) return;
      if (c.level < headingLevels[0] || c.level > headingLevels[1]) return;
      // Leaf check: the next candidate inside this section must not exist.
      const next = candidates[idx + 1];
      const inSection = next && !(next.kind === 'heading' && next.level <= c.level);
      if (inSection) return;
    } else if (!bold) {
      return;
    }
    const { tags, errors } = readTags(lines, c.i + 1);
    rules.push({ line: c.i + 1, kind: c.kind, text: c.text, tags, tagErrors: errors });
  });
  return rules;
}

/** Mark lines that are real markdown (not in code fences or multi-line HTML comments). */
function maskIgnored(lines) {
  const live = new Array(lines.length).fill(true);
  let fence = null;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      live[i] = false;
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (inComment) {
      live[i] = false;
      if (line.includes('-->')) inComment = false;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) { fence = f[1]; live[i] = false; continue; }
    if (/^\s*<!--/.test(line) && !line.includes('-->')) { inComment = true; live[i] = false; continue; }
    if (COMMENT_LINE.test(line)) live[i] = false;
  }
  return live;
}

/**
 * @typedef {{ type: 'enforced-by', refs: Array<{kind: string, target: string}> } | { type: 'unenforced', reason: string }} Tag
 */
function readTags(lines, start) {
  const tags = [];
  const errors = [];
  for (let i = start; i < lines.length; i++) {
    const c = COMMENT_LINE.exec(lines[i]);
    if (!c) break;
    const t = TAG.exec(c[1]);
    if (!t) continue; // some other comment; keep scanning the comment block
    const type = t[1].toLowerCase();
    const body = t[2];
    if (type === 'unenforced') {
      if (!body) errors.push(`line ${i + 1}: "unenforced" needs a reason`);
      else tags.push({ type, reason: body });
      continue;
    }
    const refs = [];
    for (const part of body.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = /^([a-z]+)\s*:\s*(.+)$/i.exec(part);
      if (!m) { errors.push(`line ${i + 1}: malformed reference "${part}" (expected kind:target)`); continue; }
      const kind = m[1].toLowerCase();
      if (!KINDS.includes(kind)) { errors.push(`line ${i + 1}: unknown kind "${kind}" (use ${KINDS.join(', ')})`); continue; }
      refs.push({ kind, target: m[2].trim() });
    }
    if (!refs.length && !errors.length) errors.push(`line ${i + 1}: "enforced-by" has no references`);
    if (refs.length) tags.push({ type, refs });
  }
  return { tags, errors };
}

function stripMd(s) {
  return s.replace(/(\*\*|__|`)/g, '').trim();
}
