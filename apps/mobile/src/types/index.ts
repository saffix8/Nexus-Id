// apps/mobile/src/types/index.ts
// Re-exports shared types plus mobile-only local types (defined in storage.service.ts)
// so screens/components can import from one place: `from '../types'`.
export * from '@nexusid/types';
export type { VerificationHistoryRecord, PendingVerification } from '../services/storage.service';
