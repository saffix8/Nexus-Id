---
paths:
  - "apps/mobile/**/*.{ts,tsx}"
---

# Mobile Wallet Rules (apps/mobile — React Native Android)

## Platform
- React Native + TypeScript
- **Android only** (no iOS — out of scope per SRS §1.5)
- Min SDK: Android 7.0 (API level 24) for Android Keystore

## Critical Security Rules
- **NEVER export the private key from Android Keystore** — this is physically impossible by design (CON-009)
- Private key operations ONLY via `ReactNativeBiometrics.createSignature` within `createKeys`
- Credential files stored encrypted with AES-256-GCM (CON-010)
- Uploaded national identity information stored ONLY on-device encrypted, NEVER sent to backend (BR-011)
- Proof generation (ALG-001) happens ON DEVICE — raw claim values never transmitted

## Design
- Read `docs/DESIGN.md` §3, §5 and §6.2 before any UI change. Tokens in `src/styles/tokens.ts`
- Icons: lucide-react-native · Animation: react-native-reanimated · Sheets: @gorhom/bottom-sheet
- Do not add NativeWind before the demo unless it is already installed (see DESIGN.md §6.2)
- Predicate labels from the shared map in `packages/types`
- UI changes must never touch key generation, signing or credential storage logic

## Key Libraries
- `react-native-biometrics` → Android Keystore key generation + signing
- `react-native-sqlite-storage` → encrypted local SQLite for credentials
- `react-native-camera` / QR scanner → pairing QR scan (FR-003, FR-036)

## Screen Map

| Screen | FR | Description |
|--------|----|-------------|
| SCR-001 Registration | FR-001, FR-002 | Name, email, password → creates account + generates device key |
| SCR-002 Credential Wallet | FR-010, FR-015 | Cards: category, issuer, status badge, expiry. Add + Scan QR |
| SCR-003 Credential Detail | FR-010–FR-014 | Full credential with Update + Delete (confirmation) |
| SCR-004 Add Credential | FR-006–FR-007 | Category selection → attribute entry |
| SCR-005 Attribute Entry | FR-006, FR-008 | Category-specific fields, national ID upload, submit → issuer |
| SCR-006 Profile | FR-009 | Name, email, attributes. Edit → may invalidate credentials (FR-013) |
| SCR-007 Scan QR | FR-003, FR-036 | Camera preview, scan frame, result + Retry |
| SCR-008 Verification Request | FR-020, FR-021 | Platform name, condition, countdown, Approve/Decline |
| SCR-009 Proof Progress/Result | FR-022, FR-026–FR-027 | Steps + result message |
| SCR-010 Verification History | FR-028–FR-030 | Platform, condition, date, outcome. Delete + Clear All |

## Module Coverage

### MOD-1: Onboarding (FR-001–FR-009)
- Registration → triggers device key gen (FR-002) → registers public key with backend (API-019)
- Pairing via QR scan (FR-003) → calls API-025 (ALG-006)
- Attribute submission (FR-006) → routes to correct issuer by category (BR-010)

### MOD-2: Credential Wallet (FR-010–FR-018)
- In-app auth (FR-015) via biometric / PIN before showing credentials
- Credential protection: AES-256-GCM encrypted SQLite
- Attribute update (FR-009) → credential invalidation (FR-013) → backend API-016
- Re-issuance (FR-014) goes to ORIGINAL issuer (BR-013)

### MOD-3–4: Notifications & Approval (FR-019–FR-024)
- Push notification (FR-019) arrives → show SCR-008
- Approval requires in-app auth (FR-015 precondition per FR-021)
- Request expires after 120s — ALG-005 closes session, device shows expired state

### MOD-5: Proof Generation (FR-025–FR-027)
- ALG-001: validate credential → build SD-JWT selective disclosure → sign KB-JWT with device key
- Submit proof via API-035 → backend runs ALG-002
- No valid credential → API-037 (FR-025 fail path)

### MOD-6: History (FR-028–FR-030)
- Read via API-038, delete entry via API-039, clear all via API-040

## Account Recovery (FR-037)
1. User confirms email on portal/mobile
2. Mobile calls issuer `POST /reverify` for each required issuer (API-011)
3. Submit signed confirmations + new device public key via API-028
4. Backend adds OLD device key to revocation registry (BR-007)
5. New device registered via API-029

## Timing Constants (must enforce in UI)
| Constant | Value | Screen |
|----------|-------|--------|
| QR code display timer | 120s countdown | SCR-007, SCR-013 |
| Verification request countdown | 120s | SCR-008 |
| Proof age | generated fresh per request | ALG-001 |
