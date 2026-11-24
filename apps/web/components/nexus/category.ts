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
import { CATEGORY_DISPLAY, type CredentialType } from "@nexusid/types";

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
