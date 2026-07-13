## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.

### Changelog convention

Every change (per Git commit) gets a summary record in `docs/changelog/YYYY-MM-DD-<short-hash>.md` and an index entry in `docs/agents/changelog-index.md`. See `docs/agents/changelog-index.md`.

### Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `style`. Scope is optional. Use `!` before `:` for breaking changes.
