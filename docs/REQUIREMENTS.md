# NexusID — Requirements Reference
> Condensed from SRS Version 2.0 (Final). All 45 FRs, 51 API routes, 9 algorithms, 24 BRs.
> Keep this file in sync with SRS.md. Claude Code imports this via @docs/REQUIREMENTS.md.

## Modules

| ID | Name | Primary Components |
|----|------|--------------------|
| MOD-1 | User Onboarding & Profile Setup | Mobile app: registration, device key, pairing, issuer registry, credential request |
| MOD-2 | Credential Wallet | Mobile app: view/add/update/delete credentials, protection, expiry, revocation |
| MOD-3 | Notification System | Mobile app: real-time push notifications for verification requests |
| MOD-4 | Approval & Rejection Interface | Mobile app: approve/decline requests, trigger proof generation |
| MOD-5 | Proof Generation System | Mobile app (on-device): selective disclosure SD-JWT proof |
| MOD-6 | Verification History & Logs | Mobile app + portal: history entries with outcome, platform, condition |
| MOD-7 | Browser Extension Interface | Chrome MV3: QR pairing, request detection & relay, result display |
| MOD-8 | Web Portal | Next.js: End User sign-in, SP registration, API keys, verification dashboard |

## Actors

| Actor | Description |
|-------|-------------|
| End User | Person holding credentials on the mobile wallet |
| Service Provider | Business/organization using NexusID for verification |
| Credential Issuer | NADRA / HEC / Air University / LinkedIn (simulated) |
| System | Automated backend processes (session expiry, nonce cleanup) |

## Functional Requirements

### FR Catalogue (Table 3.1)

| FR ID | Module | Title | Priority | Dependencies |
|-------|--------|-------|----------|--------------|
| FR-001 | MOD-1 | Account Registration | High | None |
| FR-002 | MOD-1 | Device Key Generation and Storage | High | FR-001 |
| FR-003 | MOD-1 | Device Pairing via QR Code | High | FR-001, FR-002, FR-031 |
| FR-004 | MOD-1 | Issuer Public Key Registry | High | None |
| FR-005 | MOD-1 | Predicate Claim Catalog | High | FR-004 |
| FR-006 | MOD-1 | Attribute Submission for Credential Issuance | High | FR-001, FR-004, FR-005 |
| FR-007 | MOD-1 | Credential Issuance and Storage | High | FR-006 |
| FR-008 | MOD-1 | National Identity Information Upload | Medium | FR-001 |
| FR-009 | MOD-1 | Profile Editing | Medium | FR-001, FR-006 |
| FR-010 | MOD-2 | View Stored Credentials | High | FR-007, FR-015 |
| FR-011 | MOD-2 | Add, Update, and Delete Credentials | High | FR-007, FR-010 |
| FR-012 | MOD-2 | Credential Protection | High | FR-007 |
| FR-013 | MOD-2 | Credential Invalidation on Attribute Update | High | FR-009, FR-011 |
| FR-014 | MOD-2 | Re-Issuance After Invalidation | Medium | FR-013 |
| FR-015 | MOD-2 | In-App Authentication | High | FR-001 |
| FR-016 | MOD-2 | Credential Expiry | High | FR-007 |
| FR-017 | MOD-2 | Issuer Revocation Request Processing | Medium | FR-004 |
| FR-018 | MOD-2 | Revoked Credential Status and Notification | Medium | FR-010, FR-017 |
| FR-019 | MOD-3 | Real-Time Verification Notification | High | FR-003, FR-032 |
| FR-020 | MOD-3 | Verification Request Summary Display | High | FR-019 |
| FR-021 | MOD-4 | Approve or Decline Verification Request | High | FR-015, FR-020 |
| FR-022 | MOD-4 | Trigger Proof Generation on Approval | High | FR-021 |
| FR-023 | MOD-4 | Notify Platform on Rejection | Medium | FR-021 |
| FR-024 | MOD-4 | Verification Request Expiry | Medium | FR-019 |
| FR-025 | MOD-5 | Validate Requested Condition Against Stored Credential | High | FR-005, FR-007, FR-016, FR-022 |
| FR-026 | MOD-5 | Generate Selective Disclosure Proof | High | FR-025 |
| FR-027 | MOD-5 | Submit Proof to Backend | High | FR-026 |
| FR-028 | MOD-6 | View Verification History | Medium | FR-021 |
| FR-029 | MOD-6 | Display Verification Request Details | Medium | FR-028, FR-045 |
| FR-030 | MOD-6 | Delete Verification History Entries | Low | FR-028 |
| FR-031 | MOD-7 | Extension Pairing QR Code Generation | High | None |
| FR-032 | MOD-7 | Detect and Relay Verification Request | High | FR-031, FR-043 |
| FR-033 | MOD-7 | Display In-Browser Request Notification | Medium | FR-019, FR-032 |
| FR-034 | MOD-7 | Display Verification Result | Medium | FR-045 |
| FR-035 | MOD-8 | Role Selection at Login | High | None |
| FR-036 | MOD-8 | User Sign-In via QR Code | High | FR-002, FR-003, FR-035 |
| FR-037 | MOD-8 | Account Recovery via Re-Issuance | High | FR-001, FR-002, FR-007, FR-035 |
| FR-038 | MOD-8 | User Dashboard Display | Medium | FR-028, FR-036 |
| FR-039 | MOD-8 | Service Provider Registration | High | FR-035 |
| FR-040 | MOD-8 | API Key Generation and Rotation | High | FR-039 |
| FR-041 | MOD-8 | Configure Verification Requirements | High | FR-005, FR-039 |
| FR-042 | MOD-8 | Service Provider Dashboard Display | Medium | FR-039, FR-040, FR-045 |
| FR-043 | MOD-8 | Verification Session Creation | High | FR-040, FR-041 |
| FR-044 | MOD-8 | Backend Proof Verification | High | FR-004, FR-013, FR-017, FR-026, FR-027, FR-043 |
| FR-045 | MOD-8 | Verification Result Retrieval | High | FR-043, FR-044 |

### FR Specifications

#### FR-001: Account Registration

**Priority:** High  
**Depends on:** None  
**Business Rule:** BR-001  

**Acceptance Criteria:** (1) A valid name, unused email address, and password create the account and log the End User in. (2) An email address that is already registered is rejected with a message saying so. (3) Missing or invalid fields are rejected with an inline message for each field. (4) The password is stored only as a salted hash.

#### FR-002: Device Key Generation and Storage

**Priority:** High  
**Depends on:** FR-001  
**Business Rule:** BR-017  

**Acceptance Criteria:** (1) After registration the backend server holds a public key linked to the account. (2) No function of the application exports the private key. (3) Signing succeeds only through Android Keystore. (4) The public key is sent over HTTPS.

#### FR-003: Device Pairing via QR Code

**Priority:** High  
**Depends on:** FR-001, FR-002, FR-031  
**Business Rule:** BR-002  

**Acceptance Criteria:** (1) Scanning a valid, unexpired code records the pairing and confirms success on both the extension and the application. (2) An expired or already used code is rejected and a new code can be requested. (3) After pairing, requests from that browser are routed only to the paired device.

#### FR-004: Issuer Public Key Registry

**Priority:** High  
**Depends on:** None  
**Business Rule:** BR-003, BR-010  

**Acceptance Criteria:** (1) The registry returns the endpoint and public key for each registered attribute category. (2) A credential signed by a key that is not in the registry is rejected (see FR-007). (3) An issuer entry added by the development team through configuration becomes usable without changes to application code.

#### FR-005: Predicate Claim Catalog

**Priority:** High  
**Depends on:** FR-004  
**Business Rule:** BR-021  

**Acceptance Criteria:** (1) The catalog contains: national identity (age over 18, age over 21, nationality is Pakistani); education (holds a bachelor’s degree or higher); enrollment (currently enrolled; CGPA at least 2.0, at least 3.0, at least 3.5); employment (employment active). (2) A request for a predicate outside the catalog is rejected. (3) Issuance, requirement configuration, and proof generation use the same catalog entries.

#### FR-006: Attribute Submission for Credential Issuance

**Priority:** High  
**Depends on:** FR-001, FR-004, FR-005  
**Business Rule:** BR-010, BR-021  

**Acceptance Criteria:** (1) The application looks up the issuer for the chosen category in the registry and sends the values directly to that issuer over HTTPS. (2) The backend server does not receive the attribute values. (3) Missing or invalid values are rejected with an inline message before submission. (4) An issuer rejection is shown to the End User with the reason, when one is provided.

#### FR-007: Credential Issuance and Storage

**Priority:** High  
**Depends on:** FR-006, FR-012  
**Business Rule:** BR-003, BR-018  

**Acceptance Criteria:** (1) A credential signed by a registered issuer is stored and its issuance is confirmed to the End User. (2) A credential with an invalid signature or from an unregistered issuer is discarded and the End User is told that issuance failed. (3) The stored credential contains a credential ID, an expiry, and the issued predicate claims. (4) The backend server holds the credential ID, issuer, category, expiry, and owning device of the credential and no attribute value.

#### FR-008: National Identity Information Upload

**Priority:** Medium  
**Depends on:** FR-001  
**Business Rule:** BR-011  

**Acceptance Criteria:** (1) Uploaded information is stored only in encrypted form on the device. (2) It is never sent to the backend server. (3) It is sent only to the Credential Issuer, during attribute submission (FR-006). (4) Viewing it requires in-app authentication (FR-015).

#### FR-009: Profile Editing

**Priority:** Medium  
**Depends on:** FR-001, FR-006  
**Business Rule:** BR-006  

**Acceptance Criteria:** (1) A change to a field that no credential depends on is saved immediately. (2) A change to an attribute that underlies a credential starts the invalidation process in FR-013. (3) Invalid values are rejected with an inline message.

#### FR-010: View Stored Credentials

**Priority:** High  
**Depends on:** FR-007, FR-015  
**Business Rule:** BR-020  

**Acceptance Criteria:** (1) All stored credentials are listed. (2) Status is shown with both a color and a text label. (3) The list is displayed only after successful in-app authentication.

#### FR-011: Add, Update, and Delete Credentials

**Priority:** High  
**Depends on:** FR-007, FR-010  
**Business Rule:** BR-012  

**Acceptance Criteria:** (1) Adding a credential follows FR-006 and FR-007. (2) Updating a credential follows FR-013 and FR-014. (3) Deleting a credential requires confirmation and removes it from the device. (4) Deleting a credential does not remove its entry from the revocation registry.

#### FR-012: Credential Protection

**Priority:** High  
**Depends on:** FR-007  
**Business Rule:** None  

**Acceptance Criteria:** (1) Stored credential data is not readable in plain form outside the application. (2) The encryption key cannot be exported from Android Keystore. (3) A credential whose content has been altered fails signature verification and is not used.

#### FR-013: Credential Invalidation on Attribute Update

**Priority:** High  
**Depends on:** FR-009, FR-011  
**Business Rule:** BR-006  

**Acceptance Criteria:** (1) After the update the old credential is shown as Revoked. (2) Its credential ID appears in the revocation registry. (3) A verification request that would use it is refused.

#### FR-014: Re-Issuance After Invalidation

**Priority:** Medium  
**Depends on:** FR-013  
**Business Rule:** BR-013  

**Acceptance Criteria:** (1) The request goes to the issuer registered for the same attribute category. (2) On success the new credential is stored as in FR-007. (3) On rejection the End User is informed and may retry or cancel, and the old credential stays invalidated.

#### FR-015: In-App Authentication

**Priority:** High  
**Depends on:** FR-001  
**Business Rule:** BR-020  

**Acceptance Criteria:** (1) Opening the credential wallet requires successful authentication. (2) Approving a verification request requires successful authentication. (3) A failed authentication denies access and does not approve the request. (4) Authentication uses the biometric or PIN facility of the device.

#### FR-016: Credential Expiry

**Priority:** High  
**Depends on:** FR-007  
**Business Rule:** BR-018  

**Acceptance Criteria:** (1) An expired credential is shown as Expired. (2) Proof generation does not use an expired credential. (3) The expiry is part of the signed credential and cannot be changed without detection.

#### FR-017: Issuer Revocation Request Processing

**Priority:** Medium  
**Depends on:** FR-004  
**Business Rule:** BR-019  

**Acceptance Criteria:** (1) A request with a valid signature from the issuer of that credential adds the credential ID to the registry. (2) A request with an invalid signature, from an unregistered issuer, or from an issuer that did not sign the credential is rejected and logged. (3) A revoked credential cannot be reinstated. (4) Any later proof from that credential is flagged as revoked.

#### FR-018: Revoked Credential Status and Notification

**Priority:** Medium  
**Depends on:** FR-010, FR-017  
**Business Rule:** BR-006  

**Acceptance Criteria:** (1) The End User receives a notification that names the affected credential. (2) The wallet shows the credential as Revoked with a color and a text label. (3) Proof generation refuses the credential. (4) If the notification is not delivered, the wallet shows the credential as Revoked the next time it is opened.

#### FR-019: Real-Time Verification Notification

**Priority:** High  
**Depends on:** FR-003, FR-032  
**Business Rule:** None  

**Acceptance Criteria:** (1) The notification reaches the paired device only. (2) It is delivered within the target in NFR-007. (3) Opening it shows the request screen.

#### FR-020: Verification Request Summary Display

**Priority:** High  
**Depends on:** FR-019  
**Business Rule:** None  

**Acceptance Criteria:** (1) The screen shows the platform name and the requested condition. (2) No cryptographic terms are shown. (3) Approve and Decline controls are shown on the same screen. (4) The platform name is the name registered by the Service Provider. It is not taken from the web page.

#### FR-021: Approve or Decline Verification Request

**Priority:** High  
**Depends on:** FR-015, FR-020  
**Business Rule:** BR-004, BR-020  

**Acceptance Criteria:** (1) No proof is generated or sent before the End User approves and authenticates. (2) Declining sends only the decline status. (3) The choice is final for that request.

#### FR-022: Trigger Proof Generation on Approval

**Priority:** High  
**Depends on:** FR-021  
**Business Rule:** None  

**Acceptance Criteria:** (1) Approval starts proof generation without further input. (2) Proof generation never starts without approval.

#### FR-023: Notify Platform on Rejection

**Priority:** Medium  
**Depends on:** FR-021  
**Business Rule:** None  

**Acceptance Criteria:** 1) The Declined outcome is recorded for the session and the Service Provider backend can retrieve it. (2) The request is no longer shown to the End User. (3) The outcome is recorded in the verification history.

#### FR-024: Verification Request Expiry

**Priority:** Medium  
**Depends on:** FR-019  
**Business Rule:** BR-022  

**Acceptance Criteria:** (1) After the response window (default 120 seconds, measured from session creation) the request can no longer be approved. (2) The Expired outcome is recorded for the session and the Service Provider backend can retrieve it. (3) The outcome is recorded in the verification history as Expired.

#### FR-025: Validate Requested Condition Against Stored Credential

**Priority:** High  
**Depends on:** FR-005, FR-007, FR-016, FR-022  
**Business Rule:** BR-006, BR-018, BR-021  

**Acceptance Criteria:** (1) A matching valid credential is selected. (2) If none exists, proof generation stops, the End User is told that the condition cannot be confirmed, and a failed outcome is recorded for the session. (3) The check makes no network call.

#### FR-026: Generate Selective Disclosure Proof

**Priority:** High  
**Depends on:** FR-025  
**Business Rule:** BR-005, BR-014  

**Acceptance Criteria:** (1) The proof contains no claim other than the requested predicate claim and no raw attribute value. (2) It contains the credential ID, session ID, nonce, and timestamp. (3) Its signature verifies with the device public key. (4) Any change to the proof invalidates its signature or its digests. (5) No data is sent to the backend server during generation.

#### FR-028: View Verification History

**Priority:** Medium  
**Depends on:** FR-021  
**Business Rule:** BR-023  

**Acceptance Criteria:** (1) The mobile application and the web portal show the same entries. (2) Entries are listed newest first. (3) No claim value is stored in or shown from the history.

#### FR-029: Display Verification Request Details

**Priority:** Medium  
**Depends on:** FR-028, FR-045  
**Business Rule:** None  

**Acceptance Criteria:** (1) Each entry shows the platform name, the requested condition, the date and time, and the outcome. (2) The outcome shown matches the outcome recorded for the session.

#### FR-030: Delete Verification History Entries

**Priority:** Low  
**Depends on:** FR-028  
**Business Rule:** BR-023  

**Acceptance Criteria:** (1) Deleted entries disappear from both the mobile application and the web portal. (2) Deleting does not remove the Service Provider’s log entry or the audit log. (3) Clearing the whole history requires confirmation.

#### FR-031: Extension Pairing QR Code Generation

**Priority:** High  
**Depends on:** None  
**Business Rule:** BR-002, BR-022  

**Acceptance Criteria:** (1) Each generated code is unique and can be used once. (2) A code expires after the QR validity window (default 120 seconds). (3) A new code can be requested at any time.

#### FR-032: Detect and Relay Verification Request

**Priority:** High  
**Depends on:** FR-031, FR-043  
**Business Rule:** BR-005  

**Acceptance Criteria:** (1) A request on a page with the integration snippet is detected without action from the End User. (2) The backend validates the session ID and nonce against the stored session and its expiry. (3) An unknown, expired, or invalid session is rejected and nothing is sent to the End User. (4) Pages without a request are ignored.

#### FR-033: Display In-Browser Request Notification

**Priority:** Medium  
**Depends on:** FR-019, FR-032  
**Business Rule:** None  

**Acceptance Criteria:** (1) A browser notification appears after the request is relayed. (2) It states that the request is waiting on the mobile application.

#### FR-034: Display Verification Result

**Priority:** Medium  
**Depends on:** FR-045  
**Business Rule:** None  

**Acceptance Criteria:** (1) The result appears after the backend receives the outcome for the session. (2) The result displayed matches the outcome recorded for the session.

#### FR-035: Role Selection at Login

**Priority:** High  
**Depends on:** None  
**Business Rule:** None  

**Acceptance Criteria:** (1) Both roles are offered. (2) Each role leads to its own sign-in method and dashboard.

#### FR-036: User Sign-In via QR Code

**Priority:** High  
**Depends on:** FR-002, FR-003, FR-035  
**Business Rule:** BR-016, BR-002  

**Acceptance Criteria:** (1) A valid signature from a paired device opens the User dashboard. (2) An invalid signature or an unpaired device is refused. (3) The sign-in code expires and can be used once. (4) No password is requested.

#### FR-037: Account Recovery via Re-Issuance

**Priority:** High  
**Depends on:** FR-001, FR-002, FR-007, FR-035  
**Business Rule:** BR-007, BR-024  

**Acceptance Criteria:** (1) Recovery requires the correct email and password and successful issuer re-verification. (2) Failed issuer re-verification denies recovery. (3) After recovery the previous device key is in the revocation registry and proofs signed with it are flagged as revoked. (4) A single-use QR code scanned on the new device links it to the account, and a new key pair is generated on it (5) The End User is told that recovery is complete.

#### FR-038: User Dashboard Display

**Priority:** Medium  
**Depends on:** FR-028, FR-036  
**Business Rule:** None  

**Acceptance Criteria:** (1) The dashboard lists connected platforms, pairings, and history. (2) Revoking a pairing ends it, and requests from that browser are no longer routed to the device.

#### FR-039: Service Provider Registration

**Priority:** High  
**Depends on:** FR-035  
**Business Rule:** BR-008  

**Acceptance Criteria:** (1) A valid platform name, email address, and password create the account and log the Service Provider in. (2) A registered email address is rejected with a message saying so. (3) Missing or invalid fields are rejected with an inline message. (4) The password is stored only as a salted hash.

#### FR-040: API Key Generation and Rotation

**Priority:** High  
**Depends on:** FR-039  
**Business Rule:** BR-009  

**Acceptance Criteria:** (1) A generated key is shown once and stored only as a hash. (2) Rotating a key invalidates the previous key immediately. (3) A request with an invalid or rotated key is rejected.

#### FR-041: Configure Verification Requirements

**Priority:** High  
**Depends on:** FR-005, FR-039  
**Business Rule:** BR-021  

**Acceptance Criteria:** (1) Only predicate claims from the catalog can be selected. (2) The saved configuration applies to later verification sessions.

#### FR-042: Service Provider Dashboard Display

**Priority:** Medium  
**Depends on:** FR-039, FR-040, FR-045  
**Business Rule:** None  

**Acceptance Criteria:** (1) The log lists time, session ID, requested condition, and outcome for each verification. (2) The log does not identify the End User. (3) The integration snippet is displayed and can be copied.

#### FR-043: Verification Session Creation

**Priority:** High  
**Depends on:** FR-040, FR-041  
**Business Rule:** BR-005, BR-021  

**Acceptance Criteria:** (1) A valid key and a configured predicate create a session and return the session ID and nonce. (2) An invalid key is rejected. (3) A predicate that is not configured for that Service Provider is rejected. (4) Every nonce is unique across all sessions. (5) A session expires after the response window (default 120 seconds).

#### FR-045: Verification

**Module:** Components  
**Priority:** High  
**Depends on:** FR-043, FR-044  
**Business Rule:** BR-015  

**Acceptance Criteria:** (1) One outcome is stored per session. (2) It appears in the Service Provider log and in the End User’s history. (3) The Service Provider backend retrieves it with its API key. (4) A request with an invalid key, or for a session that belongs to another Service Provider, is rejected. (5) The outcome is made available to the extension, which retrieves it from the backend server by polling (6) The outcome contains no claim values.
## REST API Routes (Table 5.3–5.4)

**Base URL:** `http://localhost:4000` (backend) | issuers: 4001–4004

**Auth types:** None · Device JWT · Portal JWT · API key · Pairing token · Poll secret · Issuer signature

### Health Checks

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-001 | GET | `/health` | Liveness of the backend server |
| API-002 | GET | `/health (each issuer service)` | Liveness of an issuer service |
### IF-001: Issuance API (issuers on :4001–4004)

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-003 | POST | `/api/v1/credentials/nadra/verify` | Start national identity issuance and open a 5-minute session |
| API-004 | POST | `/api/v1/credentials/nadra/verify-otp` | Complete national identity issuance |
| API-005 | POST | `/api/v1/credentials/hec/verify (also /verify)` | Issue an education credential |
| API-006 | POST | `/api/v1/credentials/au/scrape` | Issue an enrollment credential. Limit 5 requests per minute per address. |
| API-007 | GET | `/api/v1/credentials/linkedin/auth-url` | Start employment issuance by returning the authorization address |
| API-008 | GET | `/api/v1/credentials/linkedin/callback` | Receive the authorization result and return to the application |
| API-009 | POST | `/api/v1/credentials/linkedin/issue` | Issue an employment credential |
| API-010 | GET | `/.well-known/jwks.json (each issuer service, also under its credential prefix)` | Publish the issuer public key |
| API-011 | POST | `/api/v1/credentials/{nadra, hec, au, linkedin}/reverify` | Re-verify an End User for account recovery and return a signed confirmation (FR-037) |
### IF-002: Registry & Metadata API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-012 | GET | `/api/v1/issuers` | List the recognized issuers (FR-004) |
| API-013 | GET | `/api/v1/issuers/:id/public-key` | Return the public key of one issuer |
| API-014 | POST | `/api/v1/credential-records` | Register the metadata of a stored credential (FR-007) |
| API-015 | POST | `/api/v1/credential-records/revocation-status` | Return the revoked credentials among the given IDs (ALG-004, FR-018) |
| API-016 | POST | `/api/v1/credential-records/:id/invalidate` | Add the credential to the revocation registry after an attribute update (FR-013) |
### IF-003: Account, Device & Pairing API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-017 | POST | `/api/v1/auth/register` | Create an account with email and password (FR-001, FR-039) |
| API-018 | POST | `/api/v1/auth/login` | Log in with email and password, and first step of account recovery |
| API-019 | POST | `/api/v1/users/register` | Register the device and its public key (FR-002) |
| API-020 | POST | `/api/v1/users/login` | Log in a device with a signed challenge (ALG-007) |
| API-021 | POST | `/api/v1/users/challenge` | Issue a single-use challenge, valid 60 seconds by default |
| API-022 | PUT | `/api/v1/users/:id/push-token` | Replace the push token of the device |
| API-023 | POST | `/api/v1/qr-challenges` | Create a single-use QR challenge (FR-031, FR-036) |
| API-024 | GET | `/api/v1/qr-challenges/:id` | Poll the state of a QR challenge |
| API-025 | POST | `/api/v1/qr-challenges/redeem` | Complete a pairing or a portal sign-in from the phone (ALG-006, ALG-007) |
| API-026 | GET | `/api/v1/pairings` | List the paired browsers and devices (FR-038) |
| API-027 | DELETE | `/api/v1/pairings/:id` | Revoke a pairing (FR-038) |
| API-028 | POST | `/api/v1/recovery/confirm` | Submit the signed issuer confirmations and revoke the previous device key (FR-037, BR-007, BR-024) |
| API-029 | POST | `/api/v1/recovery/devices` | Register the new device with the recovery code (FR-037) |
### IF-004: Session & Outcome API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-030 | POST | `/api/v1/verification/sessions` | Create a verification session. The backend generates the session ID and the nonce (FR-043). |
| API-031 | GET | `/api/v1/verification/sessions/:id/outcome` | Read the outcome of a session (FR-045) |
### IF-005: Relay & Poll API (extension)

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-032 | POST | `/api/v1/verification/request` | Relay a detected request. The backend checks the session and the nonce and notifies the device (FR-032, FR-019). |
| API-033 | GET | `/api/v1/verification/request/:id` | Poll the outcome of a relayed request (FR-034, FR-045) |
### IF-006: Response & Proof API (mobile)

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-034 | GET | `/api/v1/verification/pending` | List the pending requests of the device (FR-020, ERR-005) |
| API-035 | POST | `/api/v1/verification/submit-proof` | Submit the proof for verification (FR-027, FR-044, ALG-002) |
| API-036 | POST | `/api/v1/verification/reject/:id` | Decline a request (FR-023) |
| API-037 | POST | `/api/v1/verification/fail/:id` | Report that no valid credential carries the requested claim (FR-025) |
### IF-007: History API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-038 | GET | `/api/v1/verification/history` | List the history of the End User, newest first (FR-028, FR-029) |
| API-039 | DELETE | `/api/v1/verification/history/:id` | Delete one history entry (FR-030) |
| API-040 | DELETE | `/api/v1/verification/history` | Clear the history of the End User (FR-030) |
### IF-008: Revocation Request API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-041 | POST | `/api/v1/revocations` | Revoke a credential on the request of its issuer (FR-017, ALG-008) |
### IF-009: Service Provider Portal API

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-042 | POST | `/api/v1/verifiers` | Register the platform of a Service Provider and create its first API key |
| API-043 | GET | `/api/v1/verifiers/api-key` | Show the key data of a platform (FR-040) |
| API-044 | POST | `/api/v1/verifiers/api-key/regenerate` | Rotate the API key (FR-040, ALG-009) |
| API-045 | GET | `/api/v1/verifiers/requirements` | Read the configured predicate claims (FR-041) |
| API-046 | PUT | `/api/v1/verifiers/requirements` | Configure the required predicate claims (FR-041) |
| API-047 | GET | `/api/v1/analytics/verifications` | Totals and recent verifications of the Service Provider (FR-042) |
| API-048 | GET | `/api/v1/analytics/recent` | Verification log of the Service Provider (FR-042) |

| API ID | Method | Path | Description |
|--------|--------|------|-------------|
| API-049 | POST | `/api/auth?action=login` | Forward the login to API-018 and set the session cookie |
| API-050 | POST | `/api/auth?action=register` | Forward the registration to API-017 and set the session cookie when a token is returned |
| API-051 | POST | `/api/auth?action=logout` | Clear the session cookie |

## Algorithms (Chapter 5.1)

| ALG ID | Name | Description | Related FR | Implementation Location |
|--------|------|-------------|------------|------------------------|
| ALG-001 | GenerateProof | Mobile: creates SD-JWT selective disclosure proof | FR-026 | packages/sd-jwt, services/issuers |
| ALG-002 | VerifyProof | Backend: verifies incoming SD-JWT proof | FR-044 | services/backend |
| ALG-003 | ConsumeNonce | Backend: marks nonce used (replay prevention) | FR-043, BR-005 | services/backend |
| ALG-004 | ComputeCredentialStatus | Backend: returns revoked credentials from list | FR-018, API-015 | services/backend |
| ALG-005 | ExpireSessions | Backend cron: closes timed-out PENDING sessions | FR-024 | services/backend |
| ALG-006 | ValidateQrChallenge | Backend: validates QR code purpose/expiry/use | FR-003, FR-036 | services/backend |
| ALG-007 | AuthenticateDeviceChallenge | Backend: verifies device signature on challenge | FR-036, API-020 | services/backend |
| ALG-008 | AcceptIssuerRevocation | Backend: processes signed issuer revocation request | FR-017, API-041 | services/backend |
| ALG-009 | RotateApiKey | Backend: invalidates old key, issues new hashed key | FR-040, BR-009 | services/backend |

## Predicate Claims Catalog (FR-005)

| Code | Category | Description |
|------|----------|-------------|
| `AGE_OVER_18` | National Identity | User is 18 or older |
| `AGE_OVER_21` | National Identity | User is 21 or older |
| `NATIONALITY_PAKISTANI` | National Identity | User holds Pakistani nationality |
| `DEGREE_BACHELOR_OR_HIGHER` | Education | HEC-verified bachelor's degree or above |
| `CGPA_AT_LEAST_2_0` | Education | CGPA ≥ 2.0 |
| `CGPA_AT_LEAST_3_0` | Education | CGPA ≥ 3.0 |
| `CGPA_AT_LEAST_3_5` | Education | CGPA ≥ 3.5 |
| `ENROLLED_CURRENT` | Enrollment | Currently enrolled at Air University |
| `EMPLOYMENT_ACTIVE` | Employment | Active LinkedIn employment record |

> **Out of scope (SRS):** driving license predicates, medical eligibility
## Business Rules (Table 3.3)

| BR ID | Rule | Related FR | Priority |
|-------|------|------------|----------|
| BR-001 | The email address shall be unique across all End User accounts. | Account identification | FR-001; UC-001 |
| BR-002 | A QR code shall be single-use and shall expire after the QR validity window if not scanned. | Prevents reuse of a pairing or sign-in code | FR-003, FR-031, FR-036; UC-002, UC-007, UC-013 |
| BR-003 | A credential shall be valid only if it is signed by an issuer listed in the issuer public key registry. | Trust model | FR-004, FR-007, FR-044; UC-003, UC-011, UC-014 |
| BR-004 | No proof shall be generated or transmitted without explicit End User approval. | User control of personal data | FR-021; UC-004 |
| BR-005 | Every verification session shall have a single-use nonce generated by the backend server. Every proof shall include the  | Replay prevention | FR-026, FR-032, FR-043, FR-044; UC-004, UC-014 |
| BR-006 | An invalidated or revoked credential shall not be used to generate a proof, and a proof from it shall be rejected. | Accuracy of verification results | FR-009, FR-013, FR-018, FR-025, FR-044; UC-004, UC-005, UC-012, UC-014 |
| BR-007 | The previous device key shall be added to the revocation registry when an account is recovered. | A lost device must not keep producing valid proofs | FR-037, FR-044; UC-007 |
| BR-008 | The email address shall be unique across all Service Provider accounts. | Account identification | FR-039; UC-008 |
| BR-009 | Rotating an API key shall invalidate the previous key immediately. | Limits exposure of a leaked key | FR-040; UC-009 |
| BR-010 | Submitted attributes shall be sent only to the issuer registered for that attribute category. | Correct issuer and data minimization | FR-004, FR-006; UC-003 |
| BR-011 | Uploaded national identity information shall be stored only in encrypted form on device and shall never be sent to the b | Protects raw personal data | FR-008; UC-003 |
| BR-012 | Deleting a credential shall not remove its entry from the revocation registry. | A revoked credential must stay revoked | FR-011; UC-005 |
| BR-013 | A re-issuance request shall be sent to the issuer that signed the original credential. | Continuity of trust | FR-014; UC-005 |
| BR-014 | Proof generation shall take place on the End User’s device. | Raw data never leaves the device | FR-026; UC-004 |
| BR-015 | The backend server shall use a proof only to verify it and shall store only the outcome, the condition name, the proof h | Trust model and data minimization | FR-027, FR-044, FR-045; UC-004, UC-014 |
| BR-016 | The web portal shall accept an End User sign-in only with a valid signature from the device key. | Passwordless authentication tied to the device key | FR-036; UC-013 |
| BR-017 | The device private key shall never be exported, transmitted, or accessible outside Android Keystore. | Key protection | FR-002; UC-001 |
| BR-018 | Every credential shall carry a unique credential ID and an expiry. The default validity is 365 days. An expired credenti | Limits the lifetime of stale claims | FR-007, FR-016, FR-025, FR-044; UC-003, UC-004, UC-011, UC-014 |
| BR-019 | The backend server shall accept a revocation request only if it is signed by the issuer that signed the credential. Revo | Only the issuer may revoke its own credentials | FR-017; UC-012 |
| BR-020 | In-app authentication shall be required to display credentials and to approve a verification request. | Theft mitigation | FR-010, FR-015, FR-021; UC-004, UC-005 |
| BR-021 | Only predicate claims from the catalog shall be issued, configured, requested, or disclosed. | Fixed set of issuer-signed conditions | FR-005, FR-006, FR-025, FR-041, FR-043; UC-003, UC-008, UC -011, UC-014 |
| BR-022 | Time windows are system parameters with these defaults: QR validity 120 seconds, verification response window 120 second | Testable limits that can be tuned | FR-024, FR-031, FR-044; UC-002, UC-004, UC-014 |
| BR-023 | Deleting verification history shall remove the End User’s own records only, not the Service Provider log or the audit lo | Each party keeps its own records | FR-028, FR-030; UC-006 |
| BR-024 | Account recovery shall require the registration email and password and successful issuer re-verification. | Recovery without the lost device must still be aut | FR-037; UC-007 |

## Key Constraints (from Chapter 3.4)

| CON ID | Constraint |
|--------|------------|
| CON-006 | SD-JWT RFC 9901 format for all credentials |
| CON-007 | SHA-256 hash algorithm for selective disclosure digests |
| CON-008 | RSA-2048 minimum for all signing keys |
| CON-009 | Android Keystore for device private key — never exported |
| CON-010 | AES-256-GCM for credential encryption on device |
| CON-011 | PostgreSQL 16 for backend persistence |
| CON-012 | Chrome MV3 for the browser extension |

## Out of Scope (SRS §1.5)

- iOS mobile application (Android only)
- Browsers other than Chrome
- Real NADRA / HEC integration (simulated)
- Production-scale hosting / load balancing
- Offline verification
- Service Provider verifying proof independently (backend outcome only)
- Driving license and medical eligibility predicates
- Service Provider API rate limiting (noted as known gap)

## Non-Functional Requirements (NFR Summary)

| NFR ID | Category | Requirement |
|--------|----------|-------------|
| NFR-001 | The system shall complete verification cycles without an internal failure. A failure is an inability to deliver a notification, generate a proof, or transmit a proof because of an internal error. Network loss and End User inaction are excluded. | At least 98% of cycles complete |
| NFR-002 | If proof generation or transmission fails, the system shall show an error message in the mobile application. | Within 5 seconds of the failure being detected |
| NFR-003 | The system shall log every internal error during credential issuance, proof generation, and proof transmission, with a timestamp and the stage. | 100% of injected errors logged with both fields |
| NFR-004 | An End User shall be able to approve or decline a request from the request screen with a single tap on the control. Approval is followed only by the in-app authentication prompt. | At most 2 interactions to approve and 1 to decline |
| NFR-005 | The system shall show the platform name and the requested condition in plain, non-technical language. | No cryptographic term (such as SD-JWT, nonce, or hash) on the request screen, and at least 4 of 5 te |
| NFR-006 | A first-time Service Provider shall be able to register and save at least one verification requirement. | Within 10 minutes from account creation to the first saved requirement |
| NFR-026 | Text and controls in the mobile application and the web portal shall remain legible. | Contrast ratio of at least 4.5:1 on every screen |
| NFR-007 | The system shall deliver a push notification to the paired mobile application after the extension relays a verification request. | At least 95% of notifications within 3 seconds over a 4G or faster connection |
| NFR-008 | Proof generation, measured from successful in-app authentication to the signed proof, shall complete on a supported Android device. | At least 95% of generations within 2 seconds |
| NFR-009 | The verification cycle, measured from End User approval to the outcome being recorded at the backend server, shall complete. | At least 95% of cycles within 10 seconds over a 4G connection |
| NFR-020 | After a revocation request is accepted, the system shall notify the End User. | At least 95% of notifications within 10 seconds |
| NFR-025 | The backend server shall support concurrent verification sessions without exceeding the targets of NFR-007 and NFR-009. | At least 50 concurrent sessions |
| NFR-010 | The system shall return to the Service Provider only the verification outcome, never the claim values behind it, and the backend server shall store no claim values. | 0 claim values in any outcome returned to a Service Provider, and 0 claim values in database records |
| NFR-011 | Every proof shall contain a single-use nonce so that a replayed proof is detected. | 100% of proofs contain the nonce and 100% of replayed proofs are rejected |
| NFR-012 | Every proof shall contain a timestamp, and a proof older than the proof validity window shall be rejected. | 100% of proofs older than 60 seconds (the default) rejected |
| NFR-013 | A proof whose credential ID or device key is in the revocation registry shall be rejected by the backend server. | 100% of such proofs rejected, from the moment the entry is added |
| NFR-014 | The End User’s private key shall be generated and stored only in hardware-backed Android Keystore. | Key not exportable and 0 successful extraction attempts |
| NFR-015 | Every proof shall carry an RSA signature and SHA-256 digests so that any alteration is detected. | 100% of altered proofs fail verification |
| NFR-016 | Stored credentials shall be encrypted at rest. | 100% of stored credential records unreadable without the Keystore-protected key |
| NFR-017 | Credentials shall not be displayed, and requests shall not be approved, without successful in-app authentication. | 100% of attempts without authentication denied |
| NFR-018 | Passwords and API keys shall be stored only as hashes. | 0 plaintext passwords or API keys in the database |
| NFR-019 | The backend server shall limit the request rate of each Service Provider to reduce the risk of denial of service. | Requests above 60 per minute per Service Provider rejected |
| NFR-021 | A new Credential Issuer shall be addable without code changes. | 0 code changes, and the new issuer’s credentials accepted after one registry entry |
| NFR-022 | Every backend REST endpoint shall be documented. | 100% of endpoints listed in Section 5.3 with method, authentication, request, response, and errors |
| NFR-023 | Backend business logic shall be covered by automated tests. | At least 70% statement coverage of the business logic modules |
| NFR-024 | The web portal shall work on current versions of Chrome, Firefox, and Edge and at screen widths from 360 px to 1920 px. | 100% of portal functional tests pass on each browser, with no horizontal scrolling at 360 px |

## Issuer Services (IF-001)

| Issuer | Port | Credential Category | Key Route |
|--------|------|---------------------|-----------|
| NADRA | 4001 | National Identity | POST /api/v1/credentials/nadra/verify → verify-otp |
| HEC | 4002 | Education | POST /api/v1/credentials/hec/verify |
| Air University | 4003 | Enrollment | POST /api/v1/credentials/au/scrape (5 req/min) |
| LinkedIn | 4004 | Employment | GET auth-url → GET callback → POST issue |

All issuers expose: `GET /.well-known/jwks.json` and `POST /reverify` (for account recovery)

## Timing & System Constants

| Constant | Value | Used In |
|----------|-------|---------|
| QR Validity Window | 120 s | FR-003, FR-031, ALG-006 |
| Device Challenge TTL | 60 s | API-021, ALG-007 |
| Verification Response Window | 120 s | FR-024, ALG-005 |
| Proof Age Limit | 60 s | ALG-002, BR-005 |
| NADRA OTP Session | 5 min | API-003/API-004 |
| AU Issuer Rate Limit | 5 req/min per IP | API-006 |
