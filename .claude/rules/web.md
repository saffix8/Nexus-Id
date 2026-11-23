---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Web app rules
SRS reference: MOD-8 (Web Portal), MOD-6 (Verification History)

- Next.js 14 App Router. Server components by default; add "use client" only
  when the component needs state, effects or browser APIs.
- Forms: react-hook-form with manual `safeParse` + `setError`. Never
  zodResolver — @hookform/resolvers is incompatible with Zod v4 here.
- Data fetching through @tanstack/react-query, not raw fetch in components.
- Styling is Tailwind against the existing design tokens: base #0C0E13,
  accent gradient #3B6FE8 to #5B4FE8, DM Sans / Inter / JetBrains Mono.
  Credential cards are document-inspired and colour-coded by credential type.
  Do not introduce new colours or a second UI library.
- Charts use Recharts; dialogs and menus use @headlessui/react.
