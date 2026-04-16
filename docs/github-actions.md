# GitHub Actions

## The problem

Code that works locally can break on another machine due to different Node versions, missing env vars, or dependencies that were never committed. Without automation, there is no guarantee that a push to main actually builds and passes tests.

## The solution: CI/CD

GitHub Actions runs automated workflows on every push. A fresh machine is spun up in GitHub's cloud, your code is cloned onto it, and a set of commands runs — the same commands you'd run locally.

If any command fails, the push is marked as broken and the team knows before it reaches production.

```
You push to GitHub
      ↓
GitHub spins up a fresh VM
      ↓
Clones your repo
      ↓
Runs your commands (install, type check, test, build)
      ↓
Pass ✓ or Fail ✗
```

## How it works

Workflows are `.yml` files stored in `.github/workflows/`. GitHub detects them automatically — no setup required beyond pushing the file.

```
.github/
└── workflows/
    ├── node.js.yml      # runs on main branch
    └── kubernetes.yml   # runs on kubernetes branch
```

Every workflow has three core concepts:

**Trigger** — when to run
```yaml
on:
  push:
    branches: [ "main" ]   # runs every time someone pushes to main
```

**Runner** — what machine to run on
```yaml
runs-on: ubuntu-latest   # fresh Ubuntu VM in GitHub's cloud
```
GitHub supports `ubuntu-latest`, `windows-latest`, and `macos-latest`. Linux is the standard choice for web apps — it matches production servers and is the fastest and most cost-efficient.

**Steps** — what commands to run
```yaml
steps:
  - uses: actions/checkout@v4       # clone the repo onto the VM
  - uses: actions/setup-node@v4     # install Node
    with:
      node-version: 22
      cache: npm                    # cache node_modules between runs
  - run: npm ci                     # install dependencies
  - run: npm test                   # run tests
```

## Services

The `services` block starts real Docker containers alongside the VM. This lets tests run against actual databases instead of mocks.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_DB: freeformcode
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready   # wait until postgres is ready before running tests
```

The `health-cmd` option is important — without it, tests might start before the database is ready and fail for the wrong reason.

## Jobs

A workflow can have multiple jobs that run in parallel or in sequence.

```yaml
jobs:
  backend:   # runs in parallel with frontend
    ...
  frontend:  # runs in parallel with backend
    ...
  docker:
    needs: [ backend, frontend ]   # only runs if both pass
    ...
```

```
backend ──┐
           ├──▶ docker
frontend ──┘
```

## Workflows in this project

### `node.js.yml` — runs on `main`

| Job | What it does |
|---|---|
| backend | Installs deps, runs TypeScript type check, runs tests against real postgres + redis |
| frontend | Installs deps, runs TypeScript type check, builds the React app |

### `kubernetes.yml` — runs on `kubernetes`

| Job | What it does |
|---|---|
| backend | Same as main |
| frontend | Same as main |
| docker | Builds both Docker images to verify the Dockerfiles still work |

## CI vs CD

| | What | When |
|---|---|---|
| CI (Continuous Integration) | Run tests and build on every push | Now — both workflows do this |
| CD (Continuous Deployment) | Automatically deploy after CI passes | Later — requires a server or registry to deploy to |

CD would extend the kubernetes workflow to push images to Docker Hub or AWS ECR and deploy to a cluster automatically after every successful build.

## Syntax

Nobody memorizes GitHub Actions syntax — everyone copies from the docs or examples and adjusts the values. The key things to know:

- `uses:` — runs a pre-built action from the GitHub marketplace
- `run:` — runs a shell command
- `working-directory:` — which folder to run the command in
- `env:` — environment variables injected into the step
- `needs:` — makes a job wait for other jobs to finish first
