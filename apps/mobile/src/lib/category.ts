// Category display (DESIGN.md §3.1, §3.6) — labels and issuers from the shared map in packages/types.
import { BriefcaseBusiness, GraduationCap, IdCard, School, type LucideIcon } from 'lucide-react-native';
import { CATEGORY_DISPLAY, PREDICATE_CODES, PREDICATE_DISPLAY, type CredentialType, type PredicateCode } from '@nexusid/types';
import { categoryColor } from '../styles/tokens';

const ICONS: Record<CredentialType, LucideIcon> = {
  identity: IdCard,
  education: GraduationCap,
  employment: BriefcaseBusiness,
  enrollment: School,
};

export interface CategoryMeta {
  type: CredentialType;
  label: string;
  issuerName: string;
  color: string;
  Icon: LucideIcon;
}

export const CATEGORY_ORDER: CredentialType[] = ['identity', 'education', 'enrollment', 'employment'];

export function categoryMeta(type: CredentialType): CategoryMeta {
  const d = CATEGORY_DISPLAY[type] ?? CATEGORY_DISPLAY.identity;
  return { type, label: d.label, issuerName: d.issuerName, color: categoryColor[type] ?? d.color, Icon: ICONS[type] ?? IdCard };
}

/** Predicates a credential of this category can confirm (catalog in packages/types). */
export function predicatesFor(type: CredentialType): PredicateCode[] {
  return PREDICATE_CODES.filter(code => PREDICATE_DISPLAY[code].category === type);
}

/** Category that issues a predicate, or null for an unknown code. */
export function categoryOfPredicate(code: string): CredentialType | null {
  return (PREDICATE_DISPLAY as Record<string, { category: CredentialType }>)[code]?.category ?? null;
}

/**
 * Data that is never shared for a predicate's category. Used on the consent
 * screen ("NEVER SHARED"). Names the attribute kinds the issuer holds, not values.
 */
export const NEVER_SHARED: Record<CredentialType, string[]> = {
  identity: ['Name', 'Date of birth', 'CNIC', 'Address'],
  education: ['Name', 'Degree number', 'Grades', 'University record'],
  enrollment: ['Name', 'Registration number', 'Exact CGPA', 'Courses'],
  employment: ['Name', 'Employer', 'Job title', 'Profile'],
};
