# NexusID Requirements Reference
> Source: docs/SRS.md (Full SRS & SDS, Version 2.0, Air University FYP)

## Modules
| ID | Name | Description |
|---|---|---|
| MOD-1 | User Onboarding & Profile Setup | Account registration, device pairing, attribute submission to Credential Issuer |
| MOD-2 | Credential Wallet | Local storage, management of signed credentials, revocation display |
| MOD-3 | Notification System | FCM push notifications for verification requests |
| MOD-4 | Approval and Rejection Interface | User review and decision on verification requests |
| MOD-5 | Proof Generation System | Local SD-JWT selective disclosure proof generation |
| MOD-6 | Verification History and Logs | Chronological record of past verifications |
| MOD-7 | Browser Extension Interface | Request detection, device pairing, relay of proofs |
| MOD-8 | Web Portal | End User + Service Provider dashboards, session creation, proof verification |

## Actors
- **End User**: holds credentials, approves verification requests via mobile app
- **Service Provider**: requests verification, receives outcome via API key
- **Credential Issuer**: signs credentials with RSA (simulated by team-operated services for NADRA, HEC, AU, LinkedIn)

## Key Constraints
| ID | Constraint |
|---|---|
| CON-006 | Credentials and proofs use SD-JWT standard (RFC 9901) |
| CON-007 | All signatures RSA, all hashing SHA-256 |
| CON-008 | End User private key stays in Android Keystore — NEVER exported |
| CON-009 | Credentials encrypted at rest on device |
| CON-011 | Push notifications via Firebase Cloud Messaging |
| CON-012 | All comms HTTPS with TLS 1.3 |

## Out of Scope (per SRS)
- iOS app
- Non-Chrome browsers
- Real NADRA/HEC/AU/LinkedIn database integration
- Offline mode
- Production-scale hosting

## High-Priority Functional Requirements (defense-critical)
- FR-001: Account Registration
- FR-002: Device Key Generation and Storage
- FR-003: Device Pairing via QR Code
- FR-004: Issuer Public Key Registry
- FR-006: Attribute Submission for Credential Issuance
- FR-007: Credential Issuance and Storage

## Full SRS
Full document at: docs/SRS.md
