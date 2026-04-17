# Docker GitHub Actions — Design Spec

**Date:** 2026-04-17  
**Status:** Approved

## Goal

Add a GitHub Actions workflow that automatically builds and pushes Docker images for the backend and frontend to Docker Hub whenever code is merged to `main`.

## Context

The project already has:
- `backend/Dockerfile` — multi-stage Node.js build
- `my-app/Dockerfile` — multi-stage Vite build served by nginx
- `docker-compose.yml` — local dev with postgres, redis, backend, frontend
- `.github/workflows/node.js.yml` — CI: runs tests and type checks on every push and PR

What's missing is a CD step that publishes the built images to a registry.

## Design

### New file: `.github/workflows/docker.yml`

**Trigger:** `push` to `main` only (not PRs, not other branches)

**Jobs:** Two parallel jobs — `build-backend` and `build-frontend` — that run independently.

**Each job does:**
1. Checkout code
2. Log in to Docker Hub using repository secrets
3. Set up Docker Buildx (required for layer caching)
4. Build and push the image with two tags

**Image tags per build:**
- `latest` — always points to the most recent build on main
- `sha-<git-short-sha>` — immutable, tied to the exact commit (enables rollback)

**Images produced:**
- `<DOCKERHUB_USERNAME>/free-form-code-backend:latest`
- `<DOCKERHUB_USERNAME>/free-form-code-backend:sha-<sha>`
- `<DOCKERHUB_USERNAME>/free-form-code-frontend:latest`
- `<DOCKERHUB_USERNAME>/free-form-code-frontend:sha-<sha>`

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token (Account Settings → Security → New Access Token) |

Set these at: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

## Relationship to Existing CI

| Workflow | Triggers on | Purpose |
|---|---|---|
| `node.js.yml` | Every push + PRs | Run tests and type checks |
| `docker.yml` | Push to `main` only | Build and push Docker images |

The two workflows are independent. In practice, you only merge to `main` after CI is green, so images on Docker Hub will always reflect tested code.

## Out of Scope

- Automatic deployment (pulling the new image to a server) — next step after this
- Multi-platform builds (e.g. ARM) — not needed yet
- Image vulnerability scanning — future consideration
