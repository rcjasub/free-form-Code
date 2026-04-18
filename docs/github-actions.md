# GitHub Actions

## The problem

Code that works on your machine can silently break on anyone else's — different Node version, a missing env var, a dependency that was never committed. Without automation, a push to `main` has no guarantee it actually builds, passes tests, or produces a working Docker image.

## The solution: automated workflows

GitHub Actions runs a set of commands automatically on every push. GitHub spins up a fresh virtual machine in the cloud, clones your repo onto it, and runs whatever you tell it to — the same commands you'd run locally.

If any command fails, the push is marked broken. Everyone can see it before it reaches production.

```
You push to GitHub
      ↓
GitHub spins up a fresh Ubuntu VM
      ↓
Clones your repo
      ↓
Runs your commands (install → type check → test → build → push)
      ↓
Pass ✓  or  Fail ✗
```

## How it works

Workflows are `.yml` files stored in `.github/workflows/`. GitHub detects them automatically — no setup required beyond pushing the file.

```
.github/
└── workflows/
    ├── node.js.yml   # CI: runs tests on every push/PR to main
    └── docker.yml    # CD: builds and pushes Docker images on every push to main
```

Every workflow has three core concepts:

**Trigger** — when to run
```yaml
on:
  push:
    branches: ["main"]       # runs when someone pushes to main
  pull_request:
    branches: ["main"]       # also runs on PRs targeting main, before they merge
```

**Runner** — what machine to run on
```yaml
runs-on: ubuntu-latest   # fresh Ubuntu VM in GitHub's cloud
```
GitHub supports `ubuntu-latest`, `windows-latest`, and `macos-latest`. Linux is standard for web apps — it matches production servers and is the fastest option.

**Steps** — what commands to run
```yaml
steps:
  - uses: actions/checkout@v4       # clone the repo onto the VM
  - uses: actions/setup-node@v4     # install Node
    with:
      node-version: 22
      cache: npm                    # cache node_modules between runs to speed things up
  - run: npm ci                     # install dependencies
  - run: npm test                   # run tests
```

`uses:` runs a pre-built action from the GitHub Actions marketplace. `run:` runs a shell command directly.

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
      --health-cmd pg_isready      # wait until postgres is ready before tests start
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

  redis:
    image: redis:alpine
    ports:
      - 6379:6379
    options: >-
      --health-cmd "redis-cli ping" # wait until redis is ready before tests start
```

The health check options are important — without them, tests might start before the database is ready and fail for the wrong reason.

## Secrets

Some workflows need credentials — Docker Hub username and password, for example. You never put those directly in a `.yml` file (that would commit them to GitHub for anyone to read).

Instead, secrets are stored in GitHub's repository settings under **Settings → Secrets and variables → Actions**. The workflow references them like this:

```yaml
- uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}   # pulled from GitHub's secret store at runtime
    password: ${{ secrets.DOCKERHUB_TOKEN }}       # never visible in logs or the file
```

GitHub masks secret values in all workflow logs automatically.

## Jobs

A workflow can have multiple jobs. By default they run in parallel. Use `needs:` to make one wait for another.

```yaml
jobs:
  backend:   # starts immediately
    ...
  frontend:  # starts immediately, runs in parallel with backend
    ...
  deploy:
    needs: [backend, frontend]   # only runs if both pass
    ...
```

```
backend ──┐
           ├──▶ deploy
frontend ──┘
```

## Workflows in this project

### `node.js.yml` — CI on `main`

Runs on every push to `main` and every pull request targeting `main`.

| Job | Steps |
|---|---|
| backend | checkout → install deps → `tsc --noEmit` (type check) → `npm test` (against real Postgres + Redis) |
| frontend | checkout → install deps → `npm run build` (type check + bundle) |

Both jobs run in parallel.

### `docker.yml` — CD on `main`

Runs on every push to `main`. Builds both Docker images and pushes them to Docker Hub.

| Job | Steps |
|---|---|
| build-backend | checkout → log in to Docker Hub → build backend image → push |
| build-frontend | checkout → log in to Docker Hub → build frontend image → push |

Both jobs run in parallel. Each push to `main` produces two tags:

```
jocsanrodriguez/free-form-code-backend:latest
jocsanrodriguez/free-form-code-backend:sha-a1b2c3d   ← pinned to exact commit
```

The `sha-` tag lets you roll back to any previous version by referencing the exact commit that built it.

#### Build caching

Docker builds are cached between runs using GitHub's built-in cache:

```yaml
cache-from: type=gha    # read layers cached from previous runs
cache-to: type=gha,mode=max    # save all layers so the next run is faster
```

Without this, every run rebuilds every layer from scratch. With it, unchanged layers (like `npm ci`) are skipped.

## CI vs CD

| | What | This project |
|---|---|---|
| CI (Continuous Integration) | Run tests and build checks on every push | `node.js.yml` — type check + test suite |
| CD (Continuous Deployment) | Automatically ship artifacts after CI passes | `docker.yml` — builds and pushes images to Docker Hub |

Right now CI and CD run independently — the Docker push doesn't wait for tests to pass. A future improvement would be to add `needs: ci` to the docker workflow so images are only pushed when everything is green.
