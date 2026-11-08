# rule-lint

**AI coding agents follow instruction files. Many rules written there run nowhere.**

`CLAUDE.md`, `AGENTS.md`, `.cursorrules` and similar files are full of rules like
"always run the tests" or "never touch generated code". Agents read them; humans skim
them; and nobody can tell which rules something actually checks and which depend
on the model choosing to comply.

`rule-lint` makes every rule declare how it is enforced. A rule either names the
mechanism that backs it (a test, an npm script, a CI workflow, a git hook, a doc) or
says plainly that it is `unenforced` and relies on judgment. Untagged rules and
references to files or scripts that don't exist fail the build.

```md
- **Run the test suite before every commit.**
<!-- enforced-by: script:test, hook:.githooks/pre-commit -->

- **Prefer composition over inheritance.**
<!-- unenforced: design judgment; reviewers check it -->
```

```
$ npx rule-lint
AGENTS.md:12: untagged: rule "Never force-push to main" has no enforced-by or unenforced tag
CLAUDE.md:30: dangling: rule "Lint before commit": script:lint — not defined in package.json

14 rule(s): 9 enforced, 3 unenforced, 2 untagged. 2 problem(s).
```

## Install & run

Zero runtime dependencies. Node 20+.

```bash
npx rule-lint                     # checks the instruction files it finds in the repo root
npx rule-lint docs/agent-rules.md # or pass files explicitly
```

Until the package is on npm, clone it and run `node bin/rule-lint.js`.

With no file arguments it checks whichever of these exist: `CLAUDE.md`, `AGENTS.md`,
`GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`,
`.cursor/rules/*.mdc`.

| Option | Meaning |
| --- | --- |
| `--root <dir>` | Repo root for resolving references (default: cwd) |
| `--heading-levels 2-6` | Heading levels that can be rules (default `2-6`; H1 is treated as the title) |
| `--no-headings` / `--no-bold` | Only bold lines / only headings count as rules |
| `--format json` | Machine-readable output with stats |
| `-q` | Problems only, no summary |

Exit codes: `0` clean, `1` problems found, `2` usage error.

## Tags

Put one or more HTML comments on the line(s) **directly after** the rule. They're
invisible when the Markdown renders.

```md
<!-- enforced-by: test:<path>, script:<npm-script>, workflow:<path>, hook:<path>, doc:<path> -->
<!-- unenforced: <reason> -->
```

| Kind | Resolves when |
| --- | --- |
| `test:` `workflow:` `hook:` `doc:` | the path exists, relative to the repo root (it may not escape the root) |
| `script:` | `package.json` defines that script |

You may use both tags on one rule. That's often the honest answer: a test covers part
of the rule and judgment covers the rest.

**`unenforced` is a real answer, not a failure.** It marks the places where the only
control is a human (or a model) choosing to comply. Making that visible is the point:
you can see your judgment-only surface, review it, and decide which rules deserve a
real check.

## How rules are detected

Instruction files are loose prose, so detection is a heuristic. It is deliberately
simple and predictable:

1. Content in fenced code blocks and HTML comments is ignored.
2. **Bold rules:** any line whose text starts with bold (`**...**` or `__...__`),
   optionally after a list marker (`-`, `*`, `+`, `1.`) or blockquote `>`.
3. **Heading rules:** headings at levels 2–6 that are *leaves*, meaning that nothing else
   that counts as a rule (no bold rule, no sub-heading) appears before the next
   heading of the same or higher level. A heading that groups rules (`## Testing`
   above three bold rules) is a container and needs no tag.
4. The tag must be on the very next line. A blank line in between means untagged.

If the heuristic flags prose you don't consider a rule, rewrite it so it doesn't
start with bold text, or tag it `unenforced` with a reason. Both make the file's
intent clearer to agents too.

## Limitations (read this)

**rule-lint proves that a rule names a mechanism, not that the mechanism enforces
the rule.** `enforced-by: test:test/foo.test.js` passes as long as that file exists,
even if the test checks something unrelated, is skipped, or never runs in CI. Tags
are claims, and rule-lint checks that each claim points at something real. Whether
the mechanism actually enforces the rule is still a job for code review.

It also doesn't understand your rules. It can't tell a rule from a description
except by the formatting heuristic above.

## CI

See [`examples/github-action.yml`](examples/github-action.yml):

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npx --yes rule-lint
```

[`examples/CLAUDE.md`](examples/CLAUDE.md) shows a tagged file. Its references are
illustrative, so it reports dangling references when linted inside this repo.
This repo lints its own [`AGENTS.md`](AGENTS.md) in CI.

## Contributing / development

```bash
npm install
npm run setup   # enables the commit hooks in .githooks/ (git config core.hooksPath .githooks)
npm test
```

The commit hooks run [`scripts/oss-guard.sh`](scripts/oss-guard.sh), a small
denylist guard. It reads case-insensitive regexes (one per line, `#` for comments) from a
private file outside the repo, `~/.config/oss-guard/denylist.txt` (override with
`OSS_GUARD_DENYLIST`). It blocks a commit when any staged file's content or name, or the
commit message, matches. It never prints the patterns or the matched text, only the
file, the line, and the denylist line number. If the denylist is missing, empty, or
invalid, it **fails closed**. It's useful on its own for anyone who keeps a public
side project next to private work.

## License

[MIT](LICENSE)
