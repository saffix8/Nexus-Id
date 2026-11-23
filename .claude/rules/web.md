---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Web Portal Rules (apps/web — Next.js 14 :3000)

## Framework
- Next.js 14 App Router (NO Pages Router)
- TypeScript + Tailwind CSS
- Route handlers in `app/api/` for server-side proxy

## Zod Compatibility Warning
- Zod v4 is installed in this project
- `@hookform/resolvers/zod` requires Zod v3 API
- Use `z.object()` not `z.strictObject()` if resolver errors appear
- If `zodResolver` breaks, downgrade to `zod@3.x` in apps/web only

## Auth Flow
- `POST /api/auth?action=login` (API-049) → proxies to backend API-018, sets session cookie
- `POST /api/auth?action=register` (API-050) → proxies to backend API-017
- `POST /api/auth?action=logout` (API-051) → clears session cookie
- Role selection screen (SCR-012, FR-035): End User vs Service Provider

## Portal Screens

### End User (FR-036–FR-038)
| Screen | FR | Description |
|--------|----|-------------|
| SCR-012 Role Selection | FR-035 | End User / SP cards at login |
| SCR-013 End User Sign-In | FR-036 | QR code scan via mobile app |
| SCR-014 End User Dashboard | FR-038 | Connected platforms, paired browsers, pairings list, recent history, Sign Out |
| SCR-015 End User History | FR-028–030 | Entries: platform, condition, date, outcome. Delete + Clear All |
| SCR-016 Account Recovery | FR-037 | Email + issuer re-verification + QR for new device |

### Service Provider (FR-039–FR-045)
| Screen | FR | Description |
|--------|----|-------------|
| SCR-017 SP Registration/Login | FR-039 | Platform name, email, password |
| SCR-018 SP Dashboard | FR-042 | Verification log table, integration snippet, links |
| SCR-019 Verification Requirements | FR-041 | Predicate claim checkboxes from catalog |
| SCR-020 API Keys | FR-040 | Generate, show once, rotate with confirmation |

## Verification Session Flow (SP side)
1. SP calls `POST /api/v1/verification/sessions` (API-030) with API key + required predicate
2. Backend returns `sessionId` + `nonce`
3. SP embeds session data into page (the "integration snippet")
4. Extension content script detects session, relays to backend (API-032)
5. SP polls `GET /api/v1/verification/sessions/:id/outcome` (API-031)

## SP Integration Snippet
The dashboard (SCR-018) shows a code snippet for SPs to embed on their page. The extension's content script reads this to detect verification requests (FR-032).

## Data Rules
- Portal stores NO credential data — only session outcomes via API
- History retrieval: `GET /api/v1/verification/history` (API-038) — paginated, newest first
- Delete history: `DELETE /api/v1/verification/history/:id` (API-039) or bulk (API-040)
