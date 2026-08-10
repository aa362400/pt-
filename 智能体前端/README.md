# ShopMate AI Frontend

React + TypeScript + Vite control console for ShopMate AI.

The frontend is built for cross-border e-commerce operators who need to review AI output before it touches real marketplace operations. It connects to the NestJS backend under `../后端` and exposes dashboards for product research, Ozon observations, pricing, Listing generation, review queues, Agent operations, team settings and system health.

## Main Areas

- **Dashboard**: operating metrics, marketplace context and platform health.
- **Product research**: candidate discovery, trend signals, keyword analysis and daily research workflow.
- **Listing and media**: listing generation, image prompt workspace and visual QA results.
- **Ozon operations**: observation intake, pricing calculator, business intelligence and order sync views.
- **Agent console**: Agent run timeline, autonomy controls, roadmap, quality center, memory governance and MCP capability tools.
- **Approval center**: human review before external writes, launches or sensitive automation steps.
- **Admin and governance**: team, billing, audit logs, enterprise readiness, notifications and store monitor pages.

## Stack

- React 19
- TypeScript 6
- Vite 8
- React Router 7
- i18next
- Recharts
- Tailwind CSS 4
- Oxlint

## Local Development

```powershell
npm install
npm run dev
```

Create `.env` from `.env.example` when connecting to a local backend.

Typical backend URL:

```text
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

## Verification

```powershell
npm run lint
npm run test
npm run build
npm run release:verify
```

`release:verify` runs lint, tests and production build in the same command.

## Project Structure

| Path | Purpose |
|---|---|
| `src/api/` | Typed API clients for backend feature domains |
| `src/pages/` | Main routed application pages |
| `src/pages-v2/` | Updated console surfaces for core operations |
| `src/components/` | Shared UI, Agent, review, platform and ops components |
| `src/auth/` | Session context and protected routes |
| `src/i18n/` | Chinese and English localization |
| `src/state/` | Client-side state helpers for workflow-heavy pages |

## Notes

This app is not a standalone mock dashboard. For useful interaction, run it with the backend and platform services described in the root README or `../后端/README.md`.
