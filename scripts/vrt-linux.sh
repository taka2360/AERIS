#!/usr/bin/env bash
# Generate/update Linux visual-regression baselines inside the official
# Playwright image (matches CI font rendering). Requires Docker to be running.
#   pnpm vrt:linux
set -euo pipefail

VERSION=$(node -p "require('@playwright/test/package.json').version")
SRC=$(pwd -W 2>/dev/null || pwd)

MSYS_NO_PATHCONV=1 docker run --rm -v "${SRC}:/src" "mcr.microsoft.com/playwright:v${VERSION}-noble" bash -c '
  set -e
  mkdir /work && cd /src
  tar --exclude=node_modules --exclude=dist --exclude=test-results -cf - . | (cd /work && tar xf -)
  cd /work
  corepack enable >/dev/null 2>&1 || npm i -g pnpm >/dev/null
  pnpm install --frozen-lockfile >/dev/null
  npx playwright test --project="vrt-*" --update-snapshots --reporter=line
  cp tests/visual/__screenshots__/*-linux.png /src/tests/visual/__screenshots__/
'
