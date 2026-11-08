import { describe, expect, it } from 'vitest';
import { findRules } from '../src/parse.js';

const md = (s) => s.replace(/^\n/, '');

describe('findRules', () => {
  it('treats bolded lines and leaf headings as rules, H1 and container headings as not', () => {
    const rules = findRules(md(`
# Project
## Testing
- **Run tests before committing.**
<!-- enforced-by: script:test -->
## Style
Use tabs.
`));
    expect(rules.map((r) => [r.line, r.kind, r.text])).toEqual([
      [3, 'bold', 'Run tests before committing.'],
      [5, 'heading', 'Style'],
    ]);
    expect(rules[0].tags).toEqual([{ type: 'enforced-by', refs: [{ kind: 'script', target: 'test' }] }]);
    expect(rules[1].tags).toEqual([]);
  });

  it('a heading with sub-headings is a container', () => {
    const rules = findRules('## A\n### B\ntext\n');
    expect(rules.map((r) => r.text)).toEqual(['B']);
  });

  it('accepts several consecutive tag comments and ignores unrelated comments', () => {
    const [r] = findRules(md(`
**No secrets in code.**
<!-- note: see wiki -->
<!-- enforced-by: hook:.githooks/pre-commit, doc:SECURITY.md -->
<!-- unenforced: reviewers also check screenshots -->
`));
    expect(r.tags).toEqual([
      { type: 'enforced-by', refs: [{ kind: 'hook', target: '.githooks/pre-commit' }, { kind: 'doc', target: 'SECURITY.md' }] },
      { type: 'unenforced', reason: 'reviewers also check screenshots' },
    ]);
  });

  it('requires the tag on the immediately following line', () => {
    const [r] = findRules('**Rule**\n\n<!-- unenforced: judgment -->\n');
    expect(r.tags).toEqual([]);
  });

  it('ignores code fences and HTML comment blocks', () => {
    const rules = findRules(md(`
\`\`\`md
## Not a rule
**Also not**
\`\`\`
<!--
**hidden**
-->
`));
    expect(rules).toEqual([]);
  });

  it('reports malformed tags', () => {
    const [r] = findRules('**R**\n<!-- enforced-by: magic:x, nonsense -->\n<!-- unenforced: -->\n');
    expect(r.tags).toEqual([]);
    expect(r.tagErrors).toHaveLength(3);
  });

  it('supports numbered lists, blockquotes, __bold__ and option toggles', () => {
    const text = '1. **One**\n> __Two__\n## Three\n';
    expect(findRules(text).map((r) => r.text)).toEqual(['One', 'Two', 'Three']);
    expect(findRules(text, { bold: false }).map((r) => r.text)).toEqual(['Three']);
    expect(findRules(text, { headings: false }).map((r) => r.text)).toEqual(['One', 'Two']);
    expect(findRules('# Title\n', { headingLevels: [1, 6] }).map((r) => r.text)).toEqual(['Title']);
  });
});
