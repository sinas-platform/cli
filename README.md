# Sinas CLI

`sinas` — the command line for building on [Sinas](https://github.com/sinas-platform/sinas):
validate, preview and install config and packages, from your terminal or from
CI/CD (see [packages/cli](packages/cli)). It also ships two skills — plain
markdown your coding agent (Claude Code, Cursor, …) reads — that `sinas init`
drops into a repo.

(This repo used to be `sinas-skills`; the old URL redirects here.)

| Piece | Purpose |
|---|---|
| [`skills/sinas-package-author`](skills/sinas-package-author) | Extend a Sinas instance via packages: queries, functions, agents, pipelines, connectors, triggers — schema, workflow, patterns |
| [`skills/sinas-ui`](skills/sinas-ui) | Build a UI or client on the Sinas runtime API: auth in every mode, agents, streaming, pipelines, files — framework-agnostic |
| [`@sinas/cli`](packages/cli) | `sinas` binary — init, validate, preview, install packages against an instance |

There is deliberately **no app scaffolding** here. `sinas init` drops the
skills into any existing repo's `.claude/skills/` plus a starter
`sinas-package.yaml`; your agent does the rest in whatever stack the
project already uses.

## Getting started

```bash
# In your project (Node 18+):
npx @sinas/cli@latest init      # skills + starter package file
npx @sinas/cli@latest login     # instance URL + admin API key → .sinas/config.json
```

Pin `@latest` (or `npm i -g @sinas/cli@latest` once). Plain
`npx @sinas/cli` runs an older `sinas` already on your PATH or in the npx
cache instead of fetching the current release — which silently gets you
the retired scaffolding flow.

(Or from a checkout of this repo: `npm install && npm run build`, then
`node packages/cli/bin/sinas.js …`.)

Create the admin API key in the Sinas console under **Settings → API
keys** (needs management permissions). Then ask your coding agent for
what you want — "add a pipeline that syncs deals nightly", "build a
review screen for the triage agent" — and it will use the skills.

The authoring loop the agent follows:

```bash
sinas add <type> <name>   # stub a resource in sinas-package.yaml
sinas validate            # after every edit
sinas preview             # dry-run diff
sinas install             # apply (asks for confirmation)
sinas status              # manifest health: resources + permissions
```

## Compatibility

Tracks Sinas 0.4.x (pipelines, provider batch mode, agent provider
overrides, OIDC token verification). Instances report their version in
the `X-Sinas-Version` response header and at `GET /info`. The instance's
`/openapi.json` is always the authority when details differ.

## License

AGPL-3.0

## Releasing

Bump the version in `packages/cli/package.json` and in `.version()` in
`packages/cli/src/index.ts`, merge to `main`, then push a matching tag:

```bash
git tag v0.3.0 && git push origin v0.3.0
```

The Release workflow checks the versions match, builds, and publishes
`@sinas/cli` to npm with provenance (npm trusted publishing; see the comment
at the top of `.github/workflows/release.yml` for the one-time setup).

