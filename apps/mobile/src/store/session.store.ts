import { create } from 'zustand';
import type { Proof } from '@nexusid/types';
import type { PendingRequestDTO } from '../services/api.service';

interface SessionState {
  /** FR-015: true after in-app biometric auth; reset when the app is backgrounded too long. */
  unlocked: boolean;
  /** Requests waiting for approval, newest first (GET /verification/pending). */
  pending: PendingRequestDTO[];
  /** Ids already shown or answered — so polling doesn't reopen them. */
  seen: ReadonlySet<string>;
  /** Proof built on Approve (SCR-008), sent by SCR-009. Held in memory only. */
  prepared: { requestId: string; credentialId: string; proof: Proof } | null;
  setPrepared: (p: SessionState['prepared']) => void;
  setUnlocked: (v: boolean) => void;
  setPending: (rows: PendingRequestDTO[]) => void;
  markSeen: (id: string) => void;
}

export const useSessionStore = create<SessionState>()(set => ({
  unlocked: false,
  pending: [],
  seen: new Set<string>(),
  prepared: null,
  setPrepared: prepared => set({ prepared }),
  setUnlocked: unlocked => set({ unlocked }),
  setPending: pending => set({ pending }),
  markSeen: id => set(s => ({ seen: new Set([...s.seen, id]) })),
}));
