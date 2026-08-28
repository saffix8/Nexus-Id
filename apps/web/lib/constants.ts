// apps/web/lib/constants.ts
import type { CredentialType } from '@nexusid/types';

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  identity: 'National Identity',
  education: 'Education',
  employment: 'Employment',
  enrollment: 'Enrollment',
};

export const CREDENTIAL_TYPE_ISSUERS: Record<CredentialType, string> = {
  identity: 'NADRA Pakistan',
  education: 'Higher Education Commission',
  employment: 'LinkedIn',
  enrollment: 'Air University',
};

export const CREDENTIAL_TYPE_ICONS: Record<CredentialType, string> = {
  identity: '🆔',
  education: '🎓',
  employment: '💼',
  enrollment: '🏫',
};

export const CREDENTIAL_TYPE_COLORS: Record<CredentialType, string> = {
  identity: '#3B82F6',
  education: '#8B5CF6',
  employment: '#0EA5E9',
  enrollment: '#10B981',
};

export const CREDENTIAL_TYPE_BG: Record<CredentialType, string> = {
  identity: '#0D1B35',
  education: '#1A0D35',
  employment: '#071B26',
  enrollment: '#071E15',
};