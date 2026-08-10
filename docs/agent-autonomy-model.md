# Agent Autonomy Model

This document is part of the ShopMate AI engineering archive.

## Purpose

The original working note tracked implementation plans, acceptance evidence, operational findings or release-readiness checks for the ShopMate AI platform. During the public English migration, this file was converted into an English archive summary so the repository can be browsed consistently by open-source reviewers.

## Current Interpretation

- Treat this file as historical context, not as a current production guarantee.
- Runtime truth should be verified through the current source code, CI workflows, local run scripts and release verification commands.
- External marketplace access, production secrets and long-running operational evidence must be configured and verified in the target environment.

## Verification Entry Points

- Root release gate: `node ./verify-platform-release.mjs`
- Backend release gate: `pnpm run release:verify`
- Frontend release gate: `npm run release:verify`
- Browser extension checks: `npm test`
- Local server scripts: `scripts/local-server/`

## Migration Note

The detailed pre-migration working notes remain available in Git history. This English archive page keeps the public documentation surface readable without changing runtime behavior.
