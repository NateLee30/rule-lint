# Example: a tagged CLAUDE.md

## Testing

- **Run the test suite before every commit.**
<!-- enforced-by: script:test, hook:.husky/pre-commit -->

- **New endpoints need an integration test.**
<!-- enforced-by: test:test/endpoints.coverage.test.js -->
<!-- unenforced: the coverage test catches missing files, not missing edge cases -->

## Style

- **Prefer composition over inheritance.**
<!-- unenforced: design judgment; reviewers check it -->

## Never edit generated files
<!-- enforced-by: workflow:.github/workflows/codegen-drift.yml -->
