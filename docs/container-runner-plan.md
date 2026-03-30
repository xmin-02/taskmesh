# Container Runner Plan

## Implemented groundwork

Taskmesh now has the runtime concepts needed for session-scoped execution:

- `runtime/sessions/<channel_or_thread_id>/workspace`
- `runtime/sessions/<channel_or_thread_id>/artifacts`
- host-vs-docker execution mode in config
- Docker provider settings per agent

## Config knobs

Environment variables:

- `TASKMESH_SESSION_ROOT`
- `TASKMESH_EXECUTION_MODE=host|docker`
- `TASKMESH_DOCKER_BINARY`
- `TASKMESH_DOCKER_<PROVIDER>_IMAGE`
- `TASKMESH_DOCKER_<PROVIDER>_MOUNTS`
- `TASKMESH_DOCKER_<PROVIDER>_ENV`

## Current behavior

- `host` mode:
  - runs the provider CLI directly
  - sets `cwd` to the session workspace
- `docker` mode:
  - runs `docker run --rm -i`
  - mounts the session workspace to `/workspace`
  - mounts the session artifacts dir to `/artifacts`
  - mounts provider auth paths declared in config
  - passes through selected env vars

## Recommended next step

Start with:

- `TASKMESH_EXECUTION_MODE=docker`
- `TASKMESH_DOCKER_CODEX_IMAGE=<working image>`
- `TASKMESH_DOCKER_GEMINI_IMAGE=<working image>`

Leave Claude on `host` until its auth strategy is verified or add a Claude-specific image plus env injection.
