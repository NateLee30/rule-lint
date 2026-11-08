// Exercises scripts/oss-guard.sh against a throwaway repo and a throwaway denylist.
// Never touches the real private denylist.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GUARD = resolve('scripts/oss-guard.sh');
let dir, denylist;
const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
const guard = (env = {}, args = []) =>
  spawnSync('bash', [GUARD, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, OSS_GUARD_DENYLIST: denylist, ...env } });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oss-guard-'));
  denylist = join(dir, '..', `denylist-${Date.now()}-${Math.random()}.txt`);
  writeFileSync(denylist, '# comment\n\nsecret[-_ ]?project\n');
  git('init', '-q');
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(denylist, { force: true }); });

describe('oss-guard', () => {
  it('passes clean staged content', () => {
    writeFileSync(join(dir, 'a.txt'), 'hello\n');
    git('add', '.');
    expect(guard().status).toBe(0);
  });

  it('blocks matching content case-insensitively without printing the pattern or match', () => {
    writeFileSync(join(dir, 'a.txt'), 'ok\nthe SECRET_Project lives here\n');
    git('add', '.');
    const r = guard();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('a.txt:2 matches denylist line 3');
    expect(r.stderr.toLowerCase()).not.toContain('secret');
  });

  it('blocks matching filenames', () => {
    writeFileSync(join(dir, 'secret-project.md'), 'clean\n');
    git('add', '.');
    expect(guard().status).toBe(1);
  });

  it('checks commit messages', () => {
    const msg = join(dir, 'MSG');
    writeFileSync(msg, 'fix secret project thing\n# secret project in a git comment is ignored\n');
    expect(guard({}, ['--message', msg]).status).toBe(1);
    writeFileSync(msg, 'clean\n');
    expect(guard({}, ['--message', msg]).status).toBe(0);
  });

  it('fails closed when the denylist is missing, empty, or invalid', () => {
    expect(guard({ OSS_GUARD_DENYLIST: join(dir, 'nope.txt') }).stderr).toMatch(/fail closed/);
    expect(guard({ OSS_GUARD_DENYLIST: join(dir, 'nope.txt') }).status).toBe(1);
    writeFileSync(denylist, '# only comments\n');
    expect(guard().status).toBe(1);
    writeFileSync(denylist, '(unclosed\n');
    writeFileSync(join(dir, 'a.txt'), 'x\n');
    git('add', '.');
    expect(guard().status).toBe(1);
  });
});
