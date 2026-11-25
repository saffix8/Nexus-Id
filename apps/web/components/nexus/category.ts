// Category → lucide icon + Tailwind classes (DESIGN.md §3.1, §3.6).
// Labels, issuer names and hex colours come from @nexusid/types so mobile and
// extension show the same thing.

import {
  BriefcaseBusiness,
  GraduationCap,
  IdCard,
  School,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_DISPLAY,
  PREDICATE_CODES,
  PREDICATE_DISPLAY,
  predicateLabel,
  type CredentialType,
  type PredicateCode,
} from "@nexusid/types";

const ICONS: Record<(typeof CATEGORY_DISPLAY)[CredentialType]["icon"], LucideIcon> = {
  IdCard,
  GraduationCap,
  BriefcaseBusiness,
  School,
};

/** Full class strings so Tailwind's scanner keeps them. */
const CLASSES: Record<CredentialType, { text: string; tint: string }> = {
  identity: { text: "text-cat-identity", tint: "bg-cat-identity/10 border-cat-identity/25 text-cat-identity" },
  education: { text: "text-cat-education", tint: "bg-cat-education/10 border-cat-education/25 text-cat-education" },
  employment: { text: "text-cat-employment", tint: "bg-cat-employment/10 border-cat-employment/25 text-cat-employment" },
  enrollment: { text: "text-cat-enrollment", tint: "bg-cat-enrollment/10 border-cat-enrollment/25 text-cat-enrollment" },
};

export function categoryMeta(category: CredentialType) {
  const display = CATEGORY_DISPLAY[category];
  return { ...display, Icon: ICONS[display.icon], ...CLASSES[category] };
}

/** Display order for the four categories (landing, add credential). */
export const CATEGORY_ORDER: CredentialType[] = ["identity", "education", "enrollment", "employment"];

/** Predicates a credential of this category can confirm (catalog in packages/types). */
export function predicatesFor(type: CredentialType): PredicateCode[] {
  return PREDICATE_CODES.filter((code) => PREDICATE_DISPLAY[code].category === type);
}

/** Category that issues a predicate, or null for an unknown code. */
export function categoryOfPredicate(code: string): CredentialType | null {
  return (PREDICATE_DISPLAY as Record<string, { category: CredentialType }>)[code]?.category ?? null;
}

/** Attribute kinds that are never shared for a category (consent "NEVER SHARED"). Same as mobile lib/category.ts. */
export const NEVER_SHARED: Record<CredentialType, string[]> = {
  identity: ["Name", "Date of birth", "CNIC", "Address"],
  education: ["Name", "Degree number", "Grades", "University record"],
  enrollment: ["Name", "Registration number", "Exact CGPA", "Courses"],
  employment: ["Name", "Employer", "Job title", "Profile"],
};

// Copy guide (DESIGN.md §8): talk about conditions, not data. Same as mobile lib/copy.ts.
const SENTENCE: Record<string, string> = {
  AGE_OVER_18: "you are over 18",
  AGE_OVER_21: "you are over 21",
  NATIONALITY_PAKISTANI: "you are a Pakistani national",
  DEGREE_BACHELOR_OR_HIGHER: "you hold a bachelor's degree or higher",
  CGPA_AT_LEAST_2_0: "your CGPA is at least 2.0",
  CGPA_AT_LEAST_3_0: "your CGPA is at least 3.0",
  CGPA_AT_LEAST_3_5: "your CGPA is at least 3.5",
  ENROLLED_CURRENT: "you are currently enrolled",
  EMPLOYMENT_ACTIVE: "you are currently employed",
};

/** "you are over 18" — for "Shop A wants to confirm …". */
export function predicateSentence(code: string): string {
  return SENTENCE[code] ?? `"${predicateLabel(code)}" is true for you`;
}

export const PRIVACY_LINE = "Only the answer is shared. Never your data.";
