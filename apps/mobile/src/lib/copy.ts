// Copy guide (DESIGN.md §8): talk about conditions, not data.
import { predicateLabel } from '@nexusid/types';

const SENTENCE: Record<string, string> = {
  AGE_OVER_18: 'you are over 18',
  AGE_OVER_21: 'you are over 21',
  NATIONALITY_PAKISTANI: 'you are a Pakistani national',
  DEGREE_BACHELOR_OR_HIGHER: "you hold a bachelor's degree or higher",
  CGPA_AT_LEAST_2_0: 'your CGPA is at least 2.0',
  CGPA_AT_LEAST_3_0: 'your CGPA is at least 3.0',
  CGPA_AT_LEAST_3_5: 'your CGPA is at least 3.5',
  ENROLLED_CURRENT: 'you are currently enrolled',
  EMPLOYMENT_ACTIVE: 'you are currently employed',
};

/** "you are over 18" — for "Shop A wants to confirm …" / "Shop A now knows …". */
export function predicateSentence(code: string): string {
  return SENTENCE[code] ?? `"${predicateLabel(code)}" is true for you`;
}

export const PRIVACY_LINE = 'Only the answer is shared. Never your data.';
