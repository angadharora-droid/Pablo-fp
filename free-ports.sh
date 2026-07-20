#!/usr/bin/env bash

# Stop an old local development process before starting a fresh one.
# A missing listener is normal, so predev should still succeed.
for port in "$@"; do
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
done
