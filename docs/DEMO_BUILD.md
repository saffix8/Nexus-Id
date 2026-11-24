# NexusID — Demo Build Plan (target: 65–70%, working end to end)

> Put this file at `docs/DEMO_BUILD.md`. Each phase below has a copy-paste prompt for Claude Code.
> The phases are ordered by demo value, so you can stop after any phase and still have something to show.
> The design system is **`docs/DESIGN.md` (Design System v2)**. It already includes the SRS v2 corrections listed in §3.
> Repo facts: `apps/web` is Next.js 14 + **Tailwind 3.4** → always use **`shadcn@2.3.0`**. Do not upgrade Tailwind, Next.js or React before the demo.

---

## 1. The demo story (what evaluators see in ~6 minutes)

Build for this one path first. Leave everything else for later.

| # | Screen | What happens | FRs |
|---|--------|--------------|-----|
| 1 | Landing page (web) | One sentence pitch: "Prove what matters. Hide what doesn't." | — |
| 2 | Service Provider portal | "Shop A" registers, gets an API key (shown once), ticks `AGE_OVER_18` | FR-039, FR-040, FR-041 |
| 3 | Phone: wallet | Already registered user opens the wallet and sees credential cards (NADRA + Air University) | FR-001, FR-002, FR-010, FR-015 |
| 4 | Phone: add credential | Adds a credential live from one issuer (NADRA: CNIC → OTP → card appears) | FR-006, FR-007 |
| 5 | Extension: pairing | Popup shows QR with a 120 s countdown. Phone scans it and both show "Paired" | FR-003, FR-031 |
| 6 | Demo shop site | "Shop A" checkout page says "Verify you're over 18 with NexusID". Extension picks it up | FR-032, FR-033, FR-043 |
| 7 | Phone: request | Push arrives: "Shop A wants to confirm: Age over 18". Shows countdown, Approve / Decline | FR-019, FR-020, FR-021 |
| 8 | Phone: proof | Fingerprint → "Generating proof → Submitting → Verified" | FR-022, FR-025–FR-027 |
| 9 | Extension + shop | Popup shows **Verified**, and the shop page unlocks checkout | FR-034, FR-044, FR-045 |
| 10 | SP dashboard | Log shows: time, session, `AGE_OVER_18`, VERIFIED. **No name, no DOB, no CNIC** | FR-042, BR-015 |
| 11 | Negative cases (30 s each) | Decline → "Declined". Wait 120 s → "Expired". Replay the same proof → rejected | FR-023, FR-024, BR-005 |
| 12 | User history | Phone + web portal history shows the same entries | FR-028, FR-038 |

**Point 10 is your strongest moment.** It shows the privacy claim at work: the Service Provider learned "over 18" and nothing else.

### What counts toward 65–70%
- **Built and live:** MOD-1 (except FR-008/FR-014), MOD-2 core, MOD-3, MOD-4, MOD-5, MOD-6, MOD-7, MOD-8 SP side + End User QR sign-in, dashboard and history.
- **Designed, shown as "next sprint":** account recovery (FR-037), issuer revocation (FR-017/FR-018), re-issuance (FR-014), ML service. Have the sequence diagrams ready in case evaluators ask.

---

## 2. UI/UX references (look at these before each phase)

Browse screens on **mobbin.com** (free tier is enough). Search the product names below.

| Surface | Primary reference | What to take from it | Secondary |
|---------|-------------------|----------------------|-----------|
| **Mobile wallet (cards)** | **Apple Wallet / Google Wallet** | Stacked cards that look like real documents, colour per issuer, tap to expand | EU Digital Identity Wallet reference app (GitHub: `eu-digital-identity-wallet`): the closest match to your domain |
| **Approve / decline request** | **EU Digital Identity Wallet**, "share data" consent screen | Lists exactly what is asked ("Age over 18"), who asks, one big Approve button | **Microsoft Authenticator / Duo Push**: sign-in approval push, countdown, fast decision |
| **Proof progress** | Stripe / bank app payment confirmation | 3-step progress → big animated checkmark → done | — |
| **Extension popup** | **1Password / Bitwarden popup** | 360 × 560, one status per screen, wordmark on top, no clutter | — |
| **SP dashboard** | **Stripe Dashboard** | Left sidebar, KPI row, logs table, API keys page with "reveal once + copy" | **Persona / Veriff / Onfido** business dashboards: identity verification for businesses, same users as yours |
| **API keys page** | Stripe → Developers → API keys | Key shown once, masked afterwards, "Roll key" with confirmation | Clerk dashboard |
| **Integration snippet** | Stripe Docs code blocks | Dark block, copy button, language tab | — |
| **Web portal shell** | **Linear / Vercel** (dark) | Dense, calm dark UI, 240 px sidebar, small type, thin borders | — |
| **Landing page** | **Stripe / Linear** home | Big headline, one animated product visual, code snippet section | Yoti / Persona landing pages |
| **QR sign-in page** | **WhatsApp Web / Telegram Web** login | QR on the left, 3 numbered steps on the right, auto-refresh | — |
| **Local touch** | NADRA **Pak-ID** app | What Pakistani users expect from a government ID flow (CNIC format, OTP) | — |

**Overall direction:** *Stripe dashboard + Apple Wallet cards + EUDI consent screen*, in your existing dark tokens. That is a serious fintech/government feel. The full reference board with screens to study is in `docs/DESIGN.md` §2.

---

## 3. Where SRS v2 overrides the old `NEXUSID DESIGN.md` (v1)

`docs/DESIGN.md` (v2) already applies all of these. The table is kept so you can explain the change if asked. The v1 design doc came before SRS v2. It describes **field-level disclosure** (show "Full Name", hide "CNIC"). SRS v2 uses **predicate claims** (FR-005). Keep the visual system and change the content:

| Design doc says | SRS v2 needs | Applies to |
|-----------------|--------------|------------|
| "WILL BE SHARED: Full Name, Degree…" with values | "WILL BE CONFIRMED: **Age over 18 — Yes**". "NEVER SHARED: name, date of birth, CNIC" | Mobile approval screen (SCR-008) |
| Verifier "Create request" with field checkboxes (Full Name, CGPA…) | Checkboxes for the **9 predicate codes** grouped in 4 categories (SCR-019) | SP requirements page |
| "Generate QR" button on credential cards | Remove it. QR codes are only for pairing and sign-in (FR-031/FR-036) | Credential card |
| Credential status: Active / Expiring / Expired | **Valid / Expired / Revoked** (FR-010, FR-016, FR-018) | Badges everywhere |
| Callback URL, field "Preview" iframe | Session + nonce created via API-030, outcome read via API-031 | SP flow |
| Extension states: Idle / Pending / Complete / Rejected | Not paired / Paired / Request pending / Verified / Failed / Declined / Expired | Popup (SCR-011) |
| Footer "FYP 2024" | "FYP 2026" | Landing |
| Accent `#3B6FE8` used for links | SRS: accent is for fills with white text, **not for small text** | Everywhere |

---

## 4. Phases with Claude Code prompts

Run each prompt in Claude Code from the repo root. Start each phase in a **new session** (`/clear`) so context stays clean. After each phase: run `/verify-flow` (or `/fyp-status`), check it in the browser or on the phone, then commit.

### Phase 0 — Audit (15 min)

```
Read docs/DEMO_BUILD.md and docs/REQUIREMENTS.md. Then audit the repo against the demo story in §1 of DEMO_BUILD.md.
For each of the 12 steps, report: WORKS / PARTIAL / MISSING, the files involved, and what is missing.
Also check: do all services boot with dev-start.sh, does `npx tsc --noEmit` pass in every workspace, and is there seed data.
Do not change any code. Output a table, then a short ordered fix list.
```

Save the output as `docs/STATUS.md`. Every phase below starts from it.

### Phase 1 — Backend: make the verification loop solid (highest priority)

```
Using docs/STATUS.md, make the backend verification loop work end to end exactly as SRS v2 describes:
API-030 create session (backend generates session ID + nonce) → API-032 extension relay (pairing token) → push / pending (API-034)
→ API-035 submit-proof running ALG-002 (issuer sig, KB-JWT, nonce via ALG-003, proof age ≤ 60 s, expiry, revocation, predicate match)
→ API-031 / API-033 outcome. Also API-036 reject, API-037 fail, and ALG-005 expiry at 120 s.
Rules: BR-005 (single-use nonce), BR-015 (store only outcome, condition, proof hash, issuer — never claim values).
Response shape { success, data, timestamp }.
Add integration tests for: happy path, decline, expiry, nonce replay, wrong predicate, expired credential.
Then add a seed script `npm run seed:demo` that creates: Service Provider "Shop A" with a known API key and AGE_OVER_18 configured,
and the 4 issuers in the registry. Never run prisma migrate reset. Show me the test output when done.
```

### Phase 2a — shadcn install (web)

`apps/web/components/ui` already holds hand-made v1 components (Badge, Button, EmptyState, Input, Skeleton, StatCard). shadcn installs into the same folder, so move them out first. Run `git tag pre-shadcn` before this phase.

```
Read docs/DESIGN.md fully. apps/web uses Tailwind 3.4, so use shadcn@2.3.0 for every shadcn command (never shadcn@latest).
Do not upgrade Tailwind, Next.js or React.
apps/web/components/ui already has hand-made components (Badge, Button, EmptyState, Input, Skeleton, StatCard). Before installing shadcn:
1. Move them to apps/web/components/legacy-ui/ and update every import that uses them, so the app still builds.
2. Run `npx shadcn@2.3.0 init` in apps/web (style: new-york, base colour: neutral, CSS variables: yes).
3. Replace the :root variables in globals.css with the dark mapping from DESIGN.md §4.2 (dark only, no light theme).
4. Add the extra NexusID colours from §3.1 to tailwind.config.ts, keeping any existing custom colours that pages still use.
5. Load DM Sans, Inter and JetBrains Mono with next/font/google (not a CSS @import).
6. `npx shadcn@2.3.0 add button input label card badge table dialog alert-dialog sheet tabs checkbox dropdown-menu avatar
   separator skeleton tooltip sonner sidebar chart form progress scroll-area`
   If `sidebar` fails on 2.3.0, skip it and note it. Phase 2b builds the shell by hand.
7. npm i lucide-react motion qrcode.react date-fns -w apps/web
8. Run `npx tsc --noEmit` and `npm run build` in apps/web, fix any errors, and show me the result. Don't build pages yet.
```

Commit: `git add -A && git commit -m "web: shadcn foundation"`

### Phase 2b — Shared NexusID components (web)

```
Read docs/DESIGN.md §3, §5 and §7. In apps/web build the shared pieces on top of the shadcn components:
- packages/types: the predicate code → label/category map from §5.6, exported for web, mobile and extension
- OutcomeBadge (every state in §3.2: icon + label + colour), PredicateChip (§5.6), CodeBlock with copy + sonner toast (§5.6),
  QRPanel with 120 s countdown ring and expired state (§5.4), CredentialCard web version (§5.1), StatCard and EmptyState
  rebuilt on shadcn Card (replacing the legacy ones), LiveLogTable shell (§5.5)
- AppShell: shadcn sidebar (sidebar-07 style) + 56 px top bar, used by both the End User and Service Provider areas
- Sonner <Toaster> in the root layout, styled with the tokens
No hydration mismatches: no Date.now(), Math.random() or locale date formatting during server render; mark client components.
Add /dev/components that renders each component in every state. Run tsc and next build.
When nothing imports from components/legacy-ui any more, delete that folder.
```

### Phase 3 — Service Provider portal (the evaluator's view)

```
Build the Service Provider side of apps/web with the shadcn and NexusID components from Phase 2, following docs/DESIGN.md §6.1.
Reference style: Stripe Dashboard.
Screens per SRS v2: SCR-012 role selection, SCR-017 register/login (API-049/050/051), SCR-018 dashboard, SCR-019 requirements, SCR-020 API keys.
- Dashboard: KPI row (total, verified, failed/declined/expired, success rate) from API-047, recent log table from API-048
  (time, session ID in mono, condition badge, outcome badge), integration snippet in a CodeBlock. Auto-refresh every 3 s
  so the new row appears live during the demo.
- Requirements: the 9 predicate codes from FR-005, grouped by category with category colours. Save via API-046.
- API keys: generate, show the key once with copy, masked afterwards, rotate with a confirm dialog (API-043/044, ALG-009).
Empty, loading (skeleton) and error states on every screen. Check it in the browser and fix anything broken.
```

### Phase 4 — Demo shop site ("Shop A")

```
Create a small demo merchant site for the presentation. Either apps/demo-shop (plain Vite + TS, port 3001) or a route group
in apps/web at /demo/shop. Pick whichever is simpler with the current extension content script.
Follow docs/DESIGN.md §6.4: light theme, ordinary e-commerce look, with the dark NexusID widget embedded.
It is a simple, nice-looking checkout page for "Shop A" (age-restricted product) with a "Verify age with NexusID" panel.
Its own small server route calls API-030 with Shop A's seeded API key, then renders the integration snippet
(session ID, nonce, platform, condition) exactly as the extension content script expects (FR-032).
Poll API-031; on VERIFIED, unlock the "Place order" button with an animation; on DECLINED/EXPIRED/FAILED show a clear message
and a "Try again" button that creates a new session. The API key must stay on the server side, never in the browser bundle.
Add it to dev-start.sh.
```

### Phase 5 — Extension popup redesign

```
Redesign apps/extension popup (SCR-011) following docs/DESIGN.md §6.3 (360 × 560) with the tokens from §3 and the
QRPanel / OutcomeBadge / PredicateChip designs from §5. Reference style: 1Password / Bitwarden popup.
Use the predicate label map from packages/types.
States: Not paired (QR via API-023 with a 120 s countdown ring, New code button) → Paired (device name, Unpair)
→ Request pending (platform, condition badge, "Waiting for your phone…" with a pulsing dot) → Verified / Failed / Declined / Expired.
Background service worker: relay with pairing token (API-032), poll with poll secret (API-033) using chrome.alarms,
chrome.notifications for FR-033. MV3 rules from .claude/rules/extension.md. No alert/confirm dialogs.
Build it and tell me exactly how to reload it in chrome://extensions.
```

### Phase 6 — Mobile wallet redesign

```
Read docs/DESIGN.md §3, §5 and §6.2. Check whether apps/mobile already uses NativeWind and follow the kit decision in §6.2
(no NativeWind → tokens.ts + own small components, do not add NativeWind now). Install lucide-react-native,
react-native-reanimated and @gorhom/bottom-sheet if missing, bundle the three fonts.
Build CredentialCard (§5.1), ConsentSheet (§5.2) and ProofStepper (§5.3) first, then the screens.
References: Apple Wallet (cards), EU Digital Identity Wallet (consent screen), Microsoft Authenticator (approve push).
Screens: SCR-002 wallet (document-style cards per category: issuer, status badge Valid/Expired/Revoked, expiry),
SCR-003 detail, SCR-004/005 add credential (state machine: pick source → form → processing → success/error),
SCR-007 scan QR, SCR-008 request (platform, "WILL BE CONFIRMED: Age over 18", "NEVER SHARED: name, date of birth, CNIC",
120 s countdown, Decline + Approve with fingerprint), SCR-009 proof progress (3 steps → animated check), SCR-010 history.
Bottom tabs: Wallet, History, Profile. In-app biometric auth before showing the wallet and before approving (FR-015).
Do not touch key generation or signing logic, only UI. Android Keystore rules in .claude/rules/mobile.md apply.
```

### Phase 7 — End User web portal (if time allows)

```
Build the End User side of apps/web: SCR-013 QR sign-in (WhatsApp Web style: QR left, 3 steps right, auto-refresh at 120 s,
API-023/024/025), SCR-014 dashboard (paired browsers with Revoke via API-026/027, recent history), SCR-015 history
(API-038/039/040, delete with confirm). Same AppShell as the SP side with a different nav.
```

### Phase 8 — Polish, landing page, demo safety

```
1. Landing page per docs/DESIGN.md §6.1 (Stripe/Linear/Resend style), plus the logo mark and favicons from §10.
2. Create a /demo-reset skill and script: re-seed Shop A, clear sessions/history for the demo user, keep credentials and pairing.
3. Go through docs/DESIGN.md §9 and §10 on every screen of web, extension and mobile, then the full §1 demo story in
   DEMO_BUILD.md: list every rough edge (copy, spacing, loading flashes, errors) with file and line, then fix them.
   Copy rules from DESIGN.md §8.
```

---

## 5. Demo day checklist

- [ ] `npm run seed:demo` and `/demo-reset` run 30 min before
- [ ] Phone charged, on the **same Wi-Fi** as the laptop, backend URL set to the laptop's LAN IP (not localhost)
- [ ] Do not rely on the university Wi-Fi: bring a phone hotspot with laptop + phone both on it
- [ ] Chrome: extension loaded, already paired (re-pair live only if you want to show it)
- [ ] Tabs open in order: landing → SP dashboard → Shop A → `chrome://extensions` hidden
- [ ] Prisma Studio open in a background tab to show "no claim values stored" if asked (BR-015)
- [ ] **Backup:** screen-record one full successful run (phone + screen) the night before
- [ ] Have ready: architecture diagram, verification sequence diagram, the FR list with built / next-sprint marks
