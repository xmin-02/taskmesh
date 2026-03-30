FROM node:22-slim

RUN useradd -m -s /bin/bash taskmesh

RUN npm install -g @google/gemini-cli

USER taskmesh
WORKDIR /workspace
