---
paths:
  - "apps/extension/**/*.{ts,tsx,js}"
---

# Chrome Extension Rules (apps/extension — Chrome MV3)

## Platform
- Chrome MV3 (Manifest V3) — Google Chrome only (out of scope: other browsers)
- TypeScript + Webpack or Vite for bundling

## Extension Architecture (MOD-7)

### Components
| Component | File/Script | Responsibility |
|-----------|-------------|----------------|
| Popup | `popup/` | Pairing QR display, pairing status, last result |
| Content Script | `content/` | Detects verification requests on pages (FR-032) |
| Background Service Worker | `background/` | Relay to backend, poll outcome, raise notifications |

## Screens

| Screen | FR | Contents |
|--------|----|----------|
| SCR-011 Extension Popup | FR-031–FR-034 | Pairing QR + countdown, pairing status, pending request or last result |

## Key Flows

### Pairing (FR-031)
1. Popup calls backend: `POST /api/v1/qr-challenges` (API-023) with purpose `PAIRING`
2. Display QR code with 120s countdown (`QRCodeCanvas`)
3. User scans with mobile → mobile calls API-025 (ALG-006, ALG-007)
4. Poll: `GET /api/v1/qr-challenges/:id` (API-024) → state changes to `REDEEMED`
5. Store pairing token in extension storage

### Request Detection (FR-032)
- Content script reads page DOM for integration snippet containing: session ID, nonce, platform name, condition code
- On detection: relay via `POST /api/v1/verification/request` (API-032) with **pairing token** auth
- Backend validates session + nonce, pushes notification to paired mobile device

### Result Display (FR-034)
- Background polls `GET /api/v1/verification/request/:id` (API-033) with **poll secret** auth
- Shows in-browser notification (FR-033) while awaiting mobile approval
- Displays outcome (VERIFIED / FAILED / DECLINED / EXPIRED) in popup

## Auth Tokens
- **Pairing token**: stored in `chrome.storage.local` after successful QR pairing
- **Poll secret**: returned when relay (API-032) is accepted; used for polling (API-033)

## Rules
- Extension NEVER stores credential data
- Extension NEVER generates or holds private keys
- Pairing is per-browser — one phone can pair with multiple browsers
- QR code is single-use (BR-002); request new code if expired or already used
- In-browser notification (FR-033) must trigger even if popup is closed

## MV3 Constraints
- Background script is a Service Worker (no persistent state between events)
- Use `chrome.storage.local` for pairing token + session state
- `chrome.alarms` for polling (not `setInterval` in service worker)
- Permissions needed: `storage`, `notifications`, `activeTab`, `scripting`
