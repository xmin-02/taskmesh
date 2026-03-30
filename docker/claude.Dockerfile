FROM node:22-slim

RUN useradd -m -s /bin/bash taskmesh

RUN npm install -g @anthropic-ai/claude-code

USER taskmesh
WORKDIR /workspace
