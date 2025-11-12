## Quick orientation

This repository implements a small distributed "notify" system using multiple services (API gateway, user, email, push, template). Primary orchestration is via Docker Compose (`docker-compose.yml`) and services live under `services/`.

Key files to inspect:
- `docker-compose.yml` — shows service boundaries, env var names and ports (RabbitMQ, Postgres, Redis, service ports).
- `services/*/Dockerfile` — each service's container build.
- `services/*/package.json` and `services/*/index.js` — entrypoint, runtime, and dependency style (example: `user-service` uses Fastify and `type: "module"`).
- `README.md` — high-level title and short description.

## Big-picture architecture (what an agent must know)
- Services are independently containerized and wired together in `docker-compose.yml`. Important integrations:
  - RabbitMQ for async messaging (AMQP) — environment variable name: `RABBITMQ_URL`.
  - PostgreSQL for the `user_service` — `DATABASE_URL` is used in envs.
  - Redis for caching — `REDIS_URL` in envs.
  - API Gateway calls `user_service` over HTTP via `USER_SERVICE_URL`.
- Conventions:
  - Each service exposes a `/:` and `/health` endpoint; `/health` is relied on by Docker and must return quickly.
  - Ports are mapped in `docker-compose.yml` (e.g., user_service -> 3001, api_gateway -> 3000).

## Coding patterns and examples to follow
- Fastify-based services: see `services/user-service/index.js`. Pattern:
  - Create Fastify with `{ logger: true }`.
  - Provide a `/health` route returning `{ status: 'ok' }`.
  - Listen on `0.0.0.0` and read port from `process.env.PORT`.
- package.json uses ES modules (`"type": "module"`) — prefer import syntax rather than require.

## Run/build/dev workflows (what to run locally)
- Start full stack for local development and integration tests:

  docker-compose up --build

- Run a single service for faster iteration (example: user-service):

  cd services/user-service
  npm install
  npm start

- Test the critical health endpoint locally (example):

  curl http://localhost:3001/health

## Service-level contracts and env vars (explicit)
- `user_service` (services/user-service):
  - ENV: PORT, DATABASE_URL (postgres://user:password@user_db:5432/user_service_db), REDIS_URL
  - Must implement: `/health` and root route; uses `pg` and `redis` libs (see package.json).
- `api_gateway`:
  - ENV: PORT, RABBITMQ_URL, USER_SERVICE_URL
  - Expected to call user-service over HTTP and publish/consume messages via RabbitMQ.
- Other services (email_service, push_service, template_service) are expected to connect to RabbitMQ.

## Integration tips for an AI agent editing code
- If you change a service's port or env var name, update `docker-compose.yml` accordingly.
- Keep the `/health` endpoint stable; Docker and local scripts depend on it.
- When adding a new dependency, update the service's `package.json` and ensure Dockerfile installs dependencies.
- Use existing conventions: ES modules, Fastify logger, environment-driven config.

## Files to update when changing integration
- `docker-compose.yml` — wiring, ports, depends_on, persistent volumes.
- `services/<name>/Dockerfile` and `services/<name>/package.json` — build and runtime.

## What not to change without verification
- RabbitMQ credentials and named volumes in `docker-compose.yml` if you want reproducible local dev.
- The contract for `USER_SERVICE_URL` (HTTP interface) unless you also update the gateway.

## When in doubt, inspect these examples
- `docker-compose.yml` — for cross-service env names and ports.
- `services/user-service/index.js` — for expected Fastify structure and health endpoint.
- `services/user-service/package.json` — for module style and direct runtime `npm start`.

If anything here is unclear or you want more examples (e.g., how the API Gateway calls user-service or how RabbitMQ messages are structured), tell me which area to expand and I'll update this guide.
