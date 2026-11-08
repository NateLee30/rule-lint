# Agent instructions for rule-lint

This file is linted by rule-lint itself (`npm run lint:rules`). Every rule below
declares how it is enforced.

## Code

- **Zero runtime dependencies.** Only devDependencies are allowed.
<!-- unenforced: reviewed by hand in PRs; a check would be easy to add later -->

- **All tests pass before merge.**
<!-- enforced-by: script:test, workflow:.github/workflows/ci.yml -->

- **Every rule in this file declares its enforcement.**
<!-- enforced-by: script:lint:rules, workflow:.github/workflows/ci.yml -->

## Repository hygiene

- **Install the commit hooks after cloning** (`npm run setup`).
<!-- enforced-by: hook:.githooks/pre-commit, hook:.githooks/commit-msg, test:test/oss-guard.test.js -->
<!-- unenforced: a fresh clone has no hooks until someone runs setup -->

- **Never commit a denylist or any private policy file.**
<!-- enforced-by: doc:.gitignore -->

- **Keep the README's limitations section honest.**
<!-- unenforced: human judgment -->
