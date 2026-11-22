# NexusID — Extended Project Context
### Companion to `NEXUSID_CONTEXT_CORE.md`. Paste the Core file first for any architecture/code task; add this file when the task touches UI/design, planning, debugging process, or FYP prep.

---

## 1. Design philosophy

NexusID should feel like **a premium banking app or a well-designed government digital service** — trust, clarity, control. Not a startup landing page, not a glass-morphism SaaS template.

**Avoid:** dark background + neon green/purple gradients + glassmorphism. **Avoid:** white + blue SaaS template + rounded-everything + hero illustration.

**Aim for:** a **document-inspired layout language** — credential cards look like physical identity documents; the verification approval screen feels like signing a form. The interface should visibly know it's handling identity.

---

## 2. Design tokens

### Color palette

```css
/* Surfaces */
--color-bg-base:        #0C0E13;   /* near-black, slight blue undertone */
--color-bg-elevated:    #13161E;   /* cards, modals, sidebars */
--color-bg-inset:       #0A0C10;   /* inputs, code blocks */
--color-bg-overlay:     #1A1E28;   /* hover states, dropdowns */

/* Borders */
--color-border-subtle:  #1E2330;
--color-border-default: #252C3D;
--color-border-strong:  #3A4560;   /* focus/active */

/* Text */
--color-text-primary:   #EEF0F6;
--color-text-secondary: #8B92A8;
--color-text-tertiary:  #525A72;
--color-text-inverse:   #0C0E13;

/* Accent — cerulean to indigo, "official seal" color */
--color-accent-primary:   #3B6FE8;
--color-accent-secondary: #5B4FE8;
--color-accent-glow:      #3B6FE820;
--color-accent-gradient:  linear-gradient(135deg, #3B6FE8 0%, #5B4FE8 100%);

/* Semantic */
--color-success: #22C55E;  --color-success-bg: #0F2A1A;  --color-success-border: #16532F;
--color-warning: #F59E0B;  --color-warning-bg: #261D07;  --color-warning-border: #4D3A0E;
--color-danger:  #EF4444;  --color-danger-bg:  #250F0F;  --color-danger-border:  #4A1515;
--color-info:    #38BDF8;  --color-info-bg:    #071B29;

/* Credential type colors — each source has its own identity color */
--color-cred-identity:     #3B82F6;  --color-cred-identity-bg:   #0D1B35;  /* NADRA — blue */
--color-cred-education:    #8B5CF6;  --color-cred-education-bg:  #1A0D35;  /* HEC — violet */
--color-cred-employment:   #0EA5E9;  --color-cred-employment-bg: #071B26;  /* LinkedIn — sky */
--color-cred-enrollment:   #10B981;  --color-cred-enrollment-bg: #071E15;  /* Air University — emerald */

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
--shadow-md: 0 4px 16px rgba(0,0,0,0.5);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.6);
--shadow-accent: 0 0 0 1px rgba(59,111,232,0.4), 0 0 24px rgba(59,111,232,0.1);
```

### Typography

- **Display/headlines:** DM Sans (geometric, authoritative)
- **Body:** Inter (dense UI, maximum legibility)
- **Mono/data:** JetBrains Mono (credential IDs, hashes, code)

```css
--text-xs: 0.64rem;  --text-sm: 0.8rem;   --text-base: 1rem;   --text-lg: 1.25rem;
--text-xl: 1.563rem; --text-2xl: 1.953rem; --text-3xl: 2.441rem; --text-4xl: 3.052rem;

--tracking-tight: -0.02em;  /* headlines */
--tracking-wide: 0.06em;    /* labels, eyebrow text */
--tracking-wider: 0.12em;   /* status badges, CAPS labels */
```

### Spacing & radius (4px base)

```css
--space-1:4px --space-2:8px --space-3:12px --space-4:16px --space-5:20px
--space-6:24px --space-8:32px --space-10:40px --space-12:48px --space-16:64px --space-20:80px

--radius-sm:4px   /* inputs, small badges */
--radius-md:8px   /* cards, buttons */
--radius-lg:12px  /* modals, large cards */
--radius-xl:16px  /* credential cards — document feel */
--radius-full:9999px /* pills, status dots */
```

### The signature component: Credential Card

The credential card is the most important UI element — it must look like a physical identity document, not a generic app card:
- A colored header strip (per credential-type color above) with a subtle diagonal security-pattern texture at ~4% opacity
- Issuer icon + type label (mono, uppercase, tracked) + issuer name
- Status badge top-right: Active (green) / Expiring Soon (orange, <30 days) / Expired (red)
- Body: always-visible fields as key/value rows, then a "N private fields" count with a lock icon, then relative issued date
- Hover reveals an action overlay: "Generate QR" + delete icon, sliding up from the bottom with a gradient scrim

### Verification Approval screen (mobile) — the most critical screen in the product

- Verifier identity block at top: name, domain, trust badge (✓ Trusted, green) or unknown badge (⚠️ Unknown, orange)
- **"Will be shared"** section: requested fields shown with actual values and a green checkmark
- **"Will be hidden"** section: every other field in the credential, shown as `••••••` with a lock icon, at reduced opacity
- Credential-in-use chip
- Two actions at the bottom: Reject (outlined, red text) / Approve & Sign (filled, accent color) — Approve triggers biometric auth before anything is signed

### UX interaction rules

- **Loading states:** <300ms → show nothing. 300ms–2s → skeleton. >2s → skeleton + "Taking longer than expected…". >8s → error state + retry.
- **Toasts:** bottom-right, dark card style, success 3s duration, error 5s duration. Copy is terse and specific: "Credential added" not "Credential was successfully added!"; "CNIC not found in NADRA database" not "Something went wrong."
- **Modals:** open via slide-up (mobile) or fade+scale (desktop). Backdrop click closes — **except destructive modals**, which require an explicit Cancel/Confirm click. Max 2 modals deep, never 3.
- **Form validation:** never show errors on first render. Only after a field is touched+blurred, or on submit attempt. Error copy must be specific ("CNIC must be in format 12345-1234567-1", not "Invalid CNIC").
- **Confirmation dialogs required for:** delete credential, reject verification, logout, delete history record. **Not required for:** generate QR, copy to clipboard, settings changes (all reversible). Dialog title states the consequence, not "Are you sure?" — e.g. "Delete this credential?" with button labeled "Delete credential", not "Yes".
- **Accessibility:** 2px accent focus ring always visible on keyboard nav, WCAG AA contrast, full keyboard reachability, modals trap focus, Escape closes/cancels, icon buttons need `aria-label`, `prefers-reduced-motion` disables all animation.

---

## 3. Build order (do not reorder without reason — later phases depend on earlier ones)

```
PHASE 1 — Core Protocol (Weeks 1–3)
  packages/sd-jwt (issuer → holder → verifier)
  packages/types
  Database schema + Prisma
  Backend entry point + middleware
  Users route → Verification route → Notification service
  (dependency order: types and sd-jwt before anything that imports them;
   schema before routes; users route before verification route, which has
   a foreign key into users)

PHASE 2 — Mobile MVP (Weeks 4–6)
  Android Keystore → Crypto service → Storage service → API service
  → Push notifications → Zustand store → screens
  (keystore before crypto service, which wraps it; storage/API before any
   screen, since screens read from them)

PHASE 3 — Real Issuers (Weeks 7–9)
  NADRA → HEC → Air University (most complex, do when rested) → LinkedIn (OAuth, well-documented, save for last)
  Each issuer needs its own RSA key pair generated first — see
  scripts/generate-issuer-keys.ts

PHASE 4 — Web App (Weeks 10–12)
  Landing page (no deps, good warmup) → Auth pages (needed before
  protected routes) → Dashboard → Add Credential Modal → QR Generator
  → Verifier Dashboard (separate portal, do last)

PHASE 5 — Browser Extension (Weeks 13–14)
  Manifest → Content script → Background worker (needs backend running)
  → Popup UI (needs storage structure from background worker)

PHASE 6 — Advanced (Weeks 15–17) — each item is independent, any order
  ZK-Proof circuit · Blockchain chaincode · ML fraud detection

PHASE 7 — Deploy (Weeks 18–20)
  Docker Compose → Integration tests → Demo + seed script
```

**Before starting any new phase**, confirm: what does it depend on from earlier phases, what must already be working, what's the first file to build and why, and are there setup gotchas (env vars, Docker services, installed CLIs) to handle first.

---

## 4. How to prompt any AI for a NexusID file — the pattern that's worked

When asking for a specific file, always specify:
1. **Which module** ("the NADRA issuer service")
2. **What file** (exact path)
3. **What it connects to** ("calls the backend's `/verification/submit-proof`")

Example that works well:
```
Build the SD-JWT library in packages/sd-jwt/src/issuer.ts.
It should expose: createCredential(claims, issuerPrivateKey) → SD-JWT string
```

Keep **one AI conversation/session per file or tightly-related file group.** Don't mix two unrelated modules in one thread — it causes cross-contamination of context and, in token-limited tools, burns budget fast. If a thread crosses ~15–20 turns, start fresh and paste just the current file + the specific issue, not the whole history.

### The three conversation types
- **BUILD** — one per file. Paste the spec, get code, paste errors back in the same thread until it works, then stop.
- **DEBUG** — for errors that span multiple files/modules. Structure: file A + file B, what's happening, exact errors from both sides, relevant code from both (handler + caller only, not whole files), what's already been checked.
- **REFERENCE** — pure Q&A/understanding, kept separate from build threads so "explained" and "built" never get confused.

---

## 5. Debugging protocol (team standard — follow this with every AI tool)

1. **Paste raw evidence first** — actual terminal output or file contents — before asking for a diagnosis. Never describe an error in your own words as the first message; that costs a wasted round-trip and often misdiagnoses.
2. **No code changes without an explicit diff or full replacement shown first** — confirm before applying.
3. **If a file has been patched multiple times and is in a weird state, ask for the complete replacement file, not another diff.** Diffs stacked on top of a corrupted file compound the damage.
4. **Never assume a previous session's fix was actually applied** — verify by viewing the current file content first.
5. **Never rewrite working code "while we're in there."** Scope every change to exactly what was asked.
6. **Never duplicate auth logic** — remember there are two separate, intentional auth flows (mobile RSA-challenge vs. web email/password). A fix to one should essentially never need to touch the other.

### Debug message template
```
File: [exact path]
Phase: [phase/module]

Error:
[paste exact error message / stack trace]

Relevant code (just the broken section):
[paste only the failing function/block]

What I've already tried:
[list]

Context:
- This file calls: [...]
- It's called by: [...]
- Related env vars: [...]
```

---

## 6. Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@nexusid/sd-jwt/issuer'` | Missing subpath `exports` in `packages/sd-jwt/package.json` | Add the exports map (see Core context §9 — status unverified, check the repo) |
| `prisma.users is undefined` / `prisma.audit_logs is undefined` | Wrong casing/pluralization | Use `prisma.user`, `prisma.auditLog` |
| `result.error.errors` is undefined | Zod v4 renamed the field | Use `.issues` |
| `zodResolver` throws or silently fails validation | Zod v4 + `@hookform/resolvers` incompatibility | Use manual `schema.safeParse(data)` + `form.setError(...)` |
| Proof verification always fails even with correct data | `sd_hash` format mismatch between holder and verifier | Both must include the trailing `~` per RFC 9901 §6.2 |
| `EADDRINUSE` on port 4000 | A stale process or Docker container already bound it | `docker ps`, stop the stale container; or `lsof -i :4000` and kill it |
| Garbled/corrupted file after pasting code in a terminal | Bracketed-paste-mode escape sequences got written into the file | Paste into an editor, never `cat > file` directly in an interactive terminal |
| Credential proof fails after a fresh DB reset | Issuer public keys in `issuer_registry` don't match the private keys on disk | Rerun `scripts/generate-issuer-keys.ts` after every DB reset |
| Mobile app can't reach the backend from the emulator | Used `localhost` instead of the emulator's host alias | Use `10.0.2.2` for the Android emulator, or your machine's LAN IP for a physical device |

---

## 7. FYP evaluator talking points (for defense prep / report writing)

- **Novelty:** believed to be the first consumer-facing SD-JWT implementation for Pakistan integrating NADRA + HEC + a university portal with selective disclosure on mobile.
- **Contribution:** a push-notification-based browser-to-mobile verification flow — existing identity systems (Entra Verified ID, IRMA, Sovrin) generally require browser plugins or blockchain-heavy flows for standard websites; this system avoids both.
- **Real integrations:** NADRA Verisys sandbox, HEC API (application-based), Air University portal scraper (explicit user consent, credentials never stored), LinkedIn OAuth.
- **Research angle:** SD-JWT proof-generation performance benchmarks across Android devices; ZKP vs. SD-JWT comparison for mobile selective disclosure; privacy analysis of centralized relay vs. blockchain-based routing.
- **Three likely evaluator questions to be ready for:** (1) Why not use blockchain for verification routing? (answer: 12–300s confirmation times make it unusable for a live flow — it's audit-only here). (2) How do you know the backend can't read the proof contents? (answer: it relays an already-signed, already-selectively-disclosed SD-JWT presentation; it validates signatures, it doesn't need or get access to anything beyond what's disclosed). (3) What happens if Air University's portal changes its HTML? (answer: the scraper is isolated as its own microservice specifically so a broken scraper doesn't take down NADRA/HEC/LinkedIn credential issuance).

---

## 8. Team workflow rules (keep conflicts low with a 4-person team across 4 modules)

- One feature branch per person per module: `feature/<name>-<module>`. Never push straight to `main`.
- Commit message format: `[P{phase}] short description` — matches the phase-numbered module list this whole project is organized around.
- Pull `main` before starting a session. After pulling anything that touches `package.json` or `prisma/schema.prisma`, re-run `npm install` and `npx prisma migrate dev` before continuing.
- **Keep a shared `MODULE_MAP.md` in the repo root**, updated on every merge: which module, who owns it, current status, what it depends on, what breaks if it changes. This is what actually prevents "I changed the schema and broke your route" — not any AI tool, but discipline about this one file.
- Update `NEXUSID_PROJECT.md`'s Progress Tracker and "Known Issues" section at the end of every session — it's the team's shared memory across AI sessions, tools, and people.

---

*This is the Extended context file. Pair it with `NEXUSID_CONTEXT_CORE.md` (architecture, schema, API, current status, conventions) for any task.*
