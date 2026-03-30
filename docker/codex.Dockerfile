FROM node:22-slim

RUN useradd -m -s /bin/bash taskmesh

RUN npm install -g @openai/codex

USER taskmesh
WORKDIR /workspace
