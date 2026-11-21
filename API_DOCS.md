# RescueMesh AI — REST API Documentation

Base URL: `http://localhost:3000/api` (Live Integrated Server) or `http://localhost:5000/api` (Standalone MongoDB Backend)

## Authentication
- `POST /api/auth/register` — Register Survivor, Relay Node, or Rescue Team account (bcryptjs password hash + JWT).
- `POST /api/auth/login` — Authenticate and receive 7-day JWT Bearer token.
- `GET /api/auth/me` — Retrieve authenticated profile (`Authorization: Bearer <token>`).

## Emergencies & Offline Sync
- `POST /api/emergency/create` — Create & AI-score an emergency SOS; broadcasts `emergency:created` via Socket.IO.
- `POST /api/emergency/sync` — Idempotent batch synchronization for offline-queued SOS & mesh messages. Preserves original `messageId` and `timestamp`; returns per-record `SYNCED` / `DUPLICATE` acknowledgements.
- `GET /api/emergency` — Query emergencies (`?severity=CRITICAL&status=RESCUE_TEAM_RECEIVED&search=...`), sorted by priority & AI severity score.
- `GET /api/emergency/:id` — Retrieve single emergency with dispatch logs and relay hop history.
- `PATCH /api/emergency/:id/status` — **[RESCUE_TEAM RBAC]** Update rescue status (`RESCUE_TEAM_RECEIVED`, `HELP_ASSIGNED`, `IN_PROGRESS`, `RESOLVED`) and dispatch notes.

## Dispatch, Teams & Analytics
- `GET /api/rescue-teams` — List active rescue units and readiness states.
- `POST /api/dispatch/assign` — **[RESCUE_TEAM RBAC]** Assign a rescue team to an incident and emit `dispatch:created`.
- `POST /api/ai/predict` — Predict emergency severity score (`0–100`), priority (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`), confidence, and recommended unit using the trained Random Forest classifier (or rule-based fallback).
- `GET /api/analytics` — Operational metrics + evaluated AI model confusion matrix and per-class F1 scores.
