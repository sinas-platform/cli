# @sinas/cli

`sinas` — author and install Sinas packages from your terminal.

```bash
npm i -g @sinas/cli
sinas login                       # → .sinas/config.json
sinas init my-app                 # scaffold a new app (delegates to @sinas/create-app)
sinas validate                    # validate sinas-package.yaml + sinas-config.yaml
sinas preview                     # dry-run, show diff
sinas install                     # apply config first, then install package
sinas status                      # check manifest health (resources, permissions)
sinas add query search-things     # append a templated resource block
```

## Configuration

In order:

1. `SINAS_URL` + `SINAS_API_KEY` environment variables (CI; `SINAS_TOKEN` also works)
2. `./.sinas/config.json` (project-local, gitignored)
3. `~/.sinas/config.json` (global fallback)

Shape:

```json
{
  "instance_url": "https://sinas.example.com",
  "admin_token": "sk_...",
  "app": { "name": "my-app", "namespace": "my-app" }
}
```

The admin token is used for the Management API — it never goes into your browser bundle.

## Files and folders

`validate`, `preview` and `install` take files or folders. Folders are searched
recursively for `*.yaml` / `*.yml`; every `SinasConfig` and `SinasPackage`
document found is used (a file may hold several, separated by `---`), other
YAML is skipped. Without paths they use `sinas-config.yaml` and
`sinas-package.yaml` in the current directory, as before.

`install` applies config files first, then installs packages, in path order,
and stops at the first failure. Every command exits 1 on any error.

```bash
sinas validate sinas/                       # check everything under sinas/
sinas preview sinas/ --markdown plan.md     # dry run; plan.md for a PR comment
sinas install sinas/ --yes                  # apply (no prompt: required outside a terminal)
```

Package variables, lowest to highest precedence:

- `SINAS_VAR_<NAME>` environment variables (CI secrets),
- `--vars-file values.yaml` (`NAME: value` pairs, e.g. one file per environment),
- `--var NAME=value` (repeatable).

A preview or install that's missing a required variable fails and names it.
Also: `--prune` (config files: also remove what a file applied before but no
longer declares — never another file's resources, anything edited by hand
since, or secrets, LLM providers, database connections and dependencies; the
preview lists what would go), `--instance <name>` (multi-instance packages),
`--json`, and `--allow-broad-role-permissions` (install). In GitHub Actions, the report is
also added to the job summary.

## CI/CD

Keep your Sinas config and packages in a folder of your repo, preview them on
pull requests and install them on merge. Create a deploy key in the console
(Access Control → API Keys → **Make a deploy key**): it's linked to the
built-in **Deployers** role, which holds exactly what CI needs
(`sinas.config.validate:all`, `sinas.config.apply:all`,
`sinas.packages.install:all`). Store it as a CI secret, one per environment,
with an expiry: applying config is admin-level, since a config can create
roles and assign them.

```yaml
# .github/workflows/sinas.yml
name: Sinas
on:
  pull_request:
    paths: ["sinas/**"]
  push:
    branches: [main]
    paths: ["sinas/**"]

jobs:
  sinas:
    runs-on: ubuntu-latest
    environment: production          # holds SINAS_URL, SINAS_API_KEY, variables
    permissions:
      contents: read
      pull-requests: write
    env:
      SINAS_URL: ${{ vars.SINAS_URL }}
      SINAS_API_KEY: ${{ secrets.SINAS_API_KEY }}
      SINAS_VAR_DESK_URL: ${{ vars.DESK_URL }}   # one per package variable
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Plan
        if: github.event_name == 'pull_request'
        run: npx -y @sinas/cli preview sinas/ --markdown plan.md

      - name: Comment the plan
        if: github.event_name == 'pull_request' && always()
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh pr comment ${{ github.event.number }} --body-file plan.md --edit-last || gh pr comment ${{ github.event.number }} --body-file plan.md

      - name: Install
        if: github.event_name == 'push'
        run: npx -y @sinas/cli install sinas/ --yes
```

Other CI systems work the same way: set the environment variables and run
`npx -y @sinas/cli preview|install <folder>`.

## License

AGPL-3.0
