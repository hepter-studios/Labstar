# 🤝 Contributing to Labstar

Labstar is developed publicly by Hepter Studios, but the architecture is still moving quickly and contribution scope is curated.

External issues, feedback and pull requests are welcome. For substantial changes, open or join an issue first so work is not duplicated or built against a direction that is about to change.

> Public repository visibility does not currently imply an open-source license. No software license is included at this time.

## Start here

Before making a significant change, read:

1. [`README.md`](README.md)
2. [`docs/LABSTAR_EVOLUTION_ROADMAP.md`](docs/LABSTAR_EVOLUTION_ROADMAP.md)
3. [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md)
4. [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)
5. [`SECURITY.md`](SECURITY.md)
6. the issue or PR related to your work

## Good contribution targets

Good public contribution areas include:

- reproducible bug reports;
- accessibility improvements;
- documentation fixes;
- localization/i18n groundwork;
- tests;
- UI polish that preserves product behavior;
- small well-scoped fixes;
- integration proposals aligned with the roadmap.

For database migrations, authentication, organization isolation, permissions, release signing, billing or security-sensitive integration work, discuss the change first.

## Branches

Use short branch names:

- `fix/...` for fixes;
- `feat/...` for product work;
- `docs/...` for documentation;
- `test/...` for tests;
- `chore/...` for maintenance.

Do not assume an old feature branch documented in historical notes is still the correct base. Use the current GitHub issue/PR state and `main` unless maintainers specify otherwise.

## Commits

Keep commits focused on one responsibility.

Examples:

- `fix: prevent cross-organization channel lookup`
- `feat: add command palette action registry`
- `docs: clarify GitHub integration permissions`

Avoid mixing a broad refactor, database migration and visual redesign in one commit.

## Pull requests

A useful PR description explains:

- the problem and objective;
- architecture affected;
- security/privacy impact;
- tests executed;
- screenshots without sensitive data when UI is affected;
- database/infrastructure impact;
- rollback considerations;
- known follow-up work.

## Validation

### Web

```bash
npm ci
npm run build
```

### Tauri

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features
```

### Backend

Run the equivalent formatting, linting and test commands in `backend/` for backend changes.

Green CI is required when checks exist, but it does not replace real validation of OAuth, permissions, migrations, desktop installation or organization isolation.

## Security and privacy

Never commit or paste into public issues/PRs:

- database passwords;
- Supabase service-role keys;
- OAuth client secrets;
- infrastructure tokens;
- updater/signing private keys;
- bearer/session tokens;
- complete invitation tokens;
- production backups;
- `.env.local`;
- private organization messages/files;
- private repository information not intended for disclosure.

Frontend variables prefixed with `VITE_` are public at runtime and must never contain secrets.

Potential vulnerabilities should follow [`SECURITY.md`](SECURITY.md), not a public exploit report.

## Database and tenancy changes

Database changes that touch organization-scoped data should include:

1. migration review;
2. explicit `organization_id`/tenant reasoning;
3. authorization/RLS review;
4. negative tests proving another organization cannot access the data;
5. rollback/recovery notes;
6. updated documentation.

## Dependencies

Before adding a package:

- confirm the capability does not already exist;
- check maintenance and license compatibility;
- avoid a dependency for trivial work;
- consider bundle/runtime/security impact;
- update lockfiles;
- explain the dependency in the PR.

## Product and UI principles

- preserve image aspect ratios;
- never hide authorization errors behind generic success UI;
- offer recovery/account switching where access can fail;
- support keyboard and focus navigation;
- maintain readable contrast;
- prepare new user-facing text for i18n;
- keep developer workflows fast;
- keep private organization data private by default.

## Community behavior

Participation is also governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

<p align="center">⭐ Build carefully. Keep the orbit clean. ⭐</p>
