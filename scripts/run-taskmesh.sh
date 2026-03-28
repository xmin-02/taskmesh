#!/bin/zsh
set -euo pipefail

cd /Users/sumin/taskmesh

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

exec /usr/bin/env node dist/index.js
