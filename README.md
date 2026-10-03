# hanashigemma

Low-anxiety Japanese conversation and immersion coach powered by Gemma

## Getting started
```bash
npm ci                                   # install from lockfile
npm test                                 # tests (npm test -- --coverage)
npm run lint && npm run typecheck        # lint + types
npm run format                           # format
npm run build                            # compile to dist/
npm audit --audit-level=high             # dependency vulnerabilities
```

Requires Node.js 22 or newer (see `engines` in `package.json`).

## Development workflow (spec-driven)
1. Requirements and design live in `docs/spec/`; change the spec before changing behavior.
2. Work happens on a branch, one task (T-nnn) at a time: tests from acceptance criteria, code, checks.
3. Every change is reviewed before merge.
Commits run pre-commit (formatters, linters, gitleaks); pushing and merging are done by a human.

## Specification
See [docs/spec](docs/spec/): product, requirements, design and task plan.

## Architecture decisions
See [docs/adr](docs/adr/).
