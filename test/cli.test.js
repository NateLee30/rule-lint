import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

let root;
const write = (p, s) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), s); };
const lint = (...args) => {
  const lines = [];
  const code = run(['--root', root, ...args], { out: (s) => lines.push(s), err: (s) => lines.push(s) });
  return { code, output: lines.join('\n') };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rule-lint-'));
  write('package.json', JSON.stringify({ scripts: { test: 'vitest' } }));
  write('test/a.test.js', '');
  write('.github/workflows/ci.yml', '');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('cli', () => {
  it('passes when every rule is tagged and every reference resolves', () => {
    write('CLAUDE.md', [
      '# Agent rules',
      '- **Tests must pass.**',
      '<!-- enforced-by: script:test, test:test/a.test.js, workflow:.github/workflows/ci.yml -->',
      '- **Prefer small PRs.**',
      '<!-- unenforced: size is a judgment call -->',
    ].join('\n'));
    const { code, output } = lint();
    expect(code).toBe(0);
    expect(output).toContain('2 rule(s): 1 enforced, 1 unenforced, 0 untagged');
  });

  it('fails on untagged rules', () => {
    write('AGENTS.md', '## Never force-push\n');
    const { code, output } = lint();
    expect(code).toBe(1);
    expect(output).toMatch(/AGENTS\.md:1: untagged: rule "Never force-push"/);
  });

  it('fails on dangling references', () => {
    write('CLAUDE.md', '**R**\n<!-- enforced-by: script:lint, test:test/missing.test.js, hook:../outside -->\n');
    const { code, output } = lint();
    expect(code).toBe(1);
    expect(output).toContain('script:lint — not defined in package.json');
    expect(output).toContain('test:test/missing.test.js — file not found');
    expect(output).toContain('path escapes the repo root');
  });

  it('fails on malformed tags', () => {
    write('CLAUDE.md', '**R**\n<!-- enforced-by: cron:nightly -->\n');
    expect(lint().code).toBe(1);
  });

  it('discovers .cursorrules and .cursor/rules/*.mdc', () => {
    write('.cursorrules', '**A**\n<!-- unenforced: x -->\n');
    write('.cursor/rules/b.mdc', '**B**\n');
    const { code, output } = lint('--format', 'json');
    expect(code).toBe(1);
    const json = JSON.parse(output);
    expect(json.stats).toEqual({ total: 2, enforced: 0, unenforced: 1, untagged: 1 });
  });

  it('lints explicit file arguments', () => {
    write('docs/rules.md', '**A**\n<!-- unenforced: x -->\n');
    expect(lint(join(root, 'docs/rules.md')).code).toBe(0);
  });

  it('returns 2 for usage errors and missing files', () => {
    expect(lint('--bogus').code).toBe(2);
    expect(lint().code).toBe(2); // nothing to discover
    expect(lint(join(root, 'nope.md')).code).toBe(2);
  });
});
