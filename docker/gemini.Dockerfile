FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash taskmesh

RUN npm install -g @google/gemini-cli

USER taskmesh
WORKDIR /workspace
