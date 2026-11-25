# NexusID — Design System v2

> Replaces `NEXUSID DESIGN.md` (v1). Put it at `docs/DESIGN.md` in the repo.
> It follows **SRS v2 §4.5** (Table 4.32 tokens, Table 4.33 screens, UI-001 to UI-010). Where v1 and SRS v2 disagree, this file follows the SRS.
> It is written for speed: every surface uses ready-made, well-tested component kits, and you only build the few signature components that make NexusID look like NexusID.

---

## 0. Summary for Claude Code

- **Look:** *Stripe Dashboard × Apple Wallet × EU Digital Identity Wallet*, dark only.
- **Web:** Next.js 14 + Tailwind + **shadcn/ui** (Radix) + **lucide-react** + **motion** + **sonner** + **recharts** (through shadcn charts) + **qrcode.react**.
- **Mobile:** React Native + token file + **react-native-reanimated** + **lucide-react-native** + **@gorhom/bottom-sheet**. Use **React Native Reusables** only if NativeWind is already set up (see §6.2).
- **Extension:** same tokens, Tailwind build, 360 × 560 popup.
- **The rule:** use the kit for generic UI (buttons, inputs, tables, dialogs). Spend time on the **6 signature components** (§5). Those are what evaluators remember.
- **Never:** gradients on cards, glassmorphism, neon, emoji as icons, light mode, accent colour on small text.

---

## 1. Design principles

1. **It handles identity, so it looks like an official document.** Credential cards look like ID cards. The approval screen looks like signing a form. Calm and precise, no playfulness.
2. **Show what is NOT shared.** Every disclosure screen lists both "Will be confirmed" and "Never shared". This is the product's whole point, so make it visible.
3. **One decision per screen.** Approve/Decline, Pair, Copy key. One primary button per screen.
4. **Live, not static.** During the demo something should visibly change on another screen within about a second (popup state, dashboard row, shop unlock). Poll every 2–3 s and animate new data in.
5. **Status is never colour alone** (UI-003). Always icon + label + colour. Revoked = grey label + struck-through title.
6. **Restraint signals trust.** Thin 1 px borders, little shadow, lots of space, one accent colour.

---

## 2. Reference board

Browse every product below on **mobbin.com** (search by name, filter "Android" or "Web"). Screenshot the 2–3 screens listed and keep them next to you while building.

### 2.1 Identity and wallet (domain references)

| Reference | Screens to study | Take from it |
|-----------|------------------|--------------|
| **EU Digital Identity Wallet** (Android reference app, GitHub `eu-digital-identity-wallet/eudi-app-android-wallet-ui`) | Dashboard, Document details, **Request → Share** | Closest product to yours. The request screen shows who is asking and exactly which items, then a single Share button and a PIN |
| **EUDI Wallet Design Guide** (ARF Annex 5.01, PDF) | Document presentation, labels, QR presentation, confirmation screens | Official UX rules for consistent wallet screens: labels, writing, result screens. Quote it in your report as your UX basis |
| **Apple Wallet / Google Wallet** | Card stack, card detail | Cards as physical objects, colour per issuer, tap to expand |
| **Microsoft Authenticator / Duo Mobile** | Push approval | Big "Approve / Deny", context (who, where), works under time pressure |
| **NADRA Pak-ID** | CNIC entry, OTP | Local expectations: CNIC format `12345-1234567-1`, 6-digit OTP |
| **Yoti / Persona (end user flow)** | Age verification | How "prove you're over 18" is worded for normal users |

### 2.2 Dashboards and developer UX (Service Provider portal)

| Reference | Screens to study | Take from it |
|-----------|------------------|--------------|
| **Stripe Dashboard** | Home KPIs, Payments list, **Developers → API keys**, Logs | The gold standard. KPI row, dense tables, keys shown once with "Roll key" |
| **Persona / Veriff / Onfido** dashboards | Inquiries list, inquiry detail | Same business as you (identity verification for companies). Outcome badges, session IDs |
| **Clerk dashboard** | API keys, Quickstart snippet | Key + snippet side by side, copy buttons |
| **Linear** | Sidebar, lists | Calm dark UI, thin borders, small dense type |
| **Vercel dashboard** | Project overview, deployment logs | Live status dots, monospace IDs |
| **Resend** | Dashboard, API keys | Very minimal developer UI that looks polished with little effort |

### 2.3 Extension, sign-in, landing

| Reference | Take from it |
|-----------|--------------|
| **1Password / Bitwarden popup** | 360 px popup, one state at a time, wordmark top-left, status in the centre |
| **WhatsApp Web / Telegram Web login** | QR left, numbered steps right, QR refreshes itself |
| **Stripe / Linear / Resend home pages** | Big headline, one product visual, code block section, a lot of black space |

### 2.4 Component and inspiration sources (copy, don't design from scratch)

| Source | Use for |
|--------|---------|
| **ui.shadcn.com → Blocks** | `sidebar-07` (collapsible sidebar), `dashboard-01` (KPI + chart + table), `login-03` |
| **ui.shadcn.com → Charts** | Area chart for verification volume, bar chart for outcomes |
| **tweakcn.com** | Visual theme editor for shadcn. Paste the tokens from §3 and export CSS |
| **Magic UI / Motion Primitives** | Only for the landing page (animated beam, border beam, text effects) |
| **lucide.dev** | All icons (see §3.6) |
| **React Native Reusables** (reactnativereusables.com) | shadcn-style components for RN, if NativeWind is present |

---

## 3. Tokens

These follow SRS v2 Table 4.32 exactly. Do not change the hex values, the SRS lists them.

### 3.1 Colour

| Token | Hex | Use (SRS) |
|-------|-----|-----------|
| `bg` | `#0C0E13` | Screen and page background |
| `surface` | `#13161E` | Cards, panels, sidebars |
| `overlay` | `#1A1E28` | Hover and selected states |
| `inset` | `#0A0C10` | Inputs, code blocks (v1 token, kept) |
| `border` | `#252C3D` | Card and input outlines |
| `border-subtle` | `#1E2330` | Dividers inside cards (v1, kept) |
| `border-strong` | `#3A4560` | Focused inputs (v1, kept) |
| `text` | `#EEF0F6` | Headings and key values |
| `text-muted` | `#8B92A8` | Body text, labels, **Revoked status** |
| `text-faint` | `#525A72` | Placeholders, metadata. **Never for important text** (contrast) |
| `accent` | `#3B6FE8` | **Fills only:** primary button, active nav, focus ring. White text on it. Not for small text |
| `accent-hover` | `#4A7EF7` | |
| `success` | `#22C55E` | Valid, Verified |
| `danger` | `#EF4444` | Expired, Failed, errors |
| `warning` | `#F59E0B` | Cautions, Pending countdown < 30 s |
| `cat-identity` | `#3B82F6` | National Identity (NADRA) |
| `cat-education` | `#8B5CF6` | Education (HEC) |
| `cat-employment` | `#0EA5E9` | Employment (LinkedIn) |
| `cat-enrollment` | `#10B981` | Enrollment (Air University) |

Tinted backgrounds are always `colour / 10%` with a `colour / 25%` border, e.g. `bg-success/10 border-success/25 text-success`.

For links and small accent text, use `#7BA0FF` (`accent-text`). It passes contrast on `#0C0E13`; `#3B6FE8` does not at small sizes.

### 3.2 Outcome and status mapping (use everywhere, same icons)

| State | Colour | lucide icon | Label |
|-------|--------|-------------|-------|
| Valid | success | `ShieldCheck` | VALID |
| Expired | danger | `CalendarX2` | EXPIRED |
| Revoked | text-muted + strikethrough title | `ShieldOff` | REVOKED |
| Verified | success | `CircleCheck` | VERIFIED |
| Failed | danger | `CircleX` | FAILED |
| Declined | text-muted | `Ban` | DECLINED |
| Expired (session) | warning | `TimerOff` | EXPIRED |
| Pending | accent-text, pulsing dot | `Loader2` (spin) or dot | PENDING |
| Paired | success | `Link2` | PAIRED |
| Not paired | text-muted | `Unlink` | NOT PAIRED |

### 3.3 Typography

| Role | Font | Size / weight | Notes |
|------|------|---------------|-------|
| Display (landing) | DM Sans | 48–64 / 700, tracking -0.03em | |
| Page title | DM Sans | 24 / 600, tracking -0.02em | |
| Section title | DM Sans | 16 / 600 | |
| Body | Inter | 14 / 400 (web), 16 (mobile) | line-height 1.5 |
| Label / eyebrow | Inter | 11 / 500, UPPERCASE, tracking 0.08em, text-muted | |
| Data / IDs / codes | JetBrains Mono | 12–13 / 400 | Session IDs, nonces, API keys, predicate codes |
| KPI number | DM Sans | 32 / 600, `tabular-nums` | |

Web: load with `next/font/google` (no CSS `@import`, it causes layout shift). Mobile: bundle the TTFs in `android/app/src/main/assets/fonts`.

Predicate codes are shown **twice**: a human label in Inter ("Age over 18") with the code underneath in mono (`AGE_OVER_18`). Evaluators see that it's real, users see that it's readable.

### 3.4 Space, radius, elevation

- Spacing: 4 px grid. Page padding 32 px (web), 20 px (mobile). Card padding 20 px. Gap between cards 16 px.
- Radius: inputs/buttons 8 px, cards 12 px, credential cards 16 px, pills full.
- Elevation: **borders, not shadows.** Only dialogs/sheets get `0 16px 48px rgba(0,0,0,.5)`.
- Max content width (web): 1200 px. Tables full width.

### 3.5 Motion

| Use | Spec |
|-----|------|
| Hover / press | 150 ms ease-out, colour/border only. Buttons `scale(0.98)` on press |
| Enter (cards, rows) | 200 ms, opacity 0→1 + y 6→0, stagger 40 ms |
| New live row in a table | Slide in + 1.5 s background flash `accent/10` → transparent |
| Dialog / sheet | 250 ms spring (damping 30, stiffness 300) |
| Success check | SVG stroke draw 450 ms, then scale 1→1.05→1 |
| Countdown ring | Linear, continuous; turns warning at 30 s, danger at 10 s |
| Reduced motion | `prefers-reduced-motion` → opacity only, no movement |

Web: `motion` package (`motion/react`). Mobile: `react-native-reanimated`.

### 3.6 Icons

lucide only, stroke 1.75, sizes 16 (inline) / 20 (nav) / 24 (headers) / 40 (empty states, inside a 64 px rounded square).

| Category | Icon |
|----------|------|
| National Identity | `IdCard` |
| Education | `GraduationCap` |
| Employment | `BriefcaseBusiness` |
| Enrollment | `School` |
| Wallet | `WalletCards` |
| History | `History` |
| Profile | `UserRound` |
| Scan | `ScanLine` |
| API key | `KeyRound` |
| Requirements | `ListChecks` |
| Dashboard | `LayoutDashboard` |
| Extension / browser | `Chrome` → use `Globe` (brand icons are avoided) |
| Privacy / hidden | `EyeOff` |
| Fingerprint | `Fingerprint` |

---

## 4. Theme setup (web)

### 4.1 Check the Tailwind version first

```bash
grep '"tailwindcss"' apps/web/package.json
```

- **Tailwind v3** — **this repo: `apps/web` is on 3.4.** Use **`shadcn@2.3.0`** for init and adding components. The latest shadcn CLI targets Tailwind v4.
- **Tailwind v4:** use `shadcn@latest`.
- **Do not upgrade Tailwind or Next.js before the demo.** Upgrading a Next 14 app from Tailwind v3 to v4 has known breakages with Radix-based components.

### 4.2 shadcn variable mapping (dark only, put on `:root`)

Tailwind v3 (`globals.css`, HSL triplets):

```css
@layer base {
  :root {
    --background: 225 22% 6%;        /* #0C0E13 */
    --foreground: 228 33% 95%;       /* #EEF0F6 */
    --card: 224 22% 10%;             /* #13161E */
    --card-foreground: 228 33% 95%;
    --popover: 224 22% 10%;
    --popover-foreground: 228 33% 95%;
    --primary: 222 79% 57%;          /* #3B6FE8 */
    --primary-foreground: 0 0% 100%;
    --secondary: 223 21% 13%;        /* #1A1E28 */
    --secondary-foreground: 228 33% 95%;
    --muted: 223 21% 13%;
    --muted-foreground: 228 13% 60%; /* #8B92A8 */
    --accent: 223 21% 13%;           /* shadcn "accent" = hover surface, NOT brand */
    --accent-foreground: 228 33% 95%;
    --destructive: 0 84% 60%;        /* #EF4444 */
    --destructive-foreground: 0 0% 100%;
    --border: 223 24% 19%;           /* #252C3D */
    --input: 223 24% 19%;
    --ring: 222 79% 57%;
    --radius: 0.5rem;
    --chart-1: 222 79% 57%;
    --chart-2: 142 71% 45%;
    --chart-3: 0 84% 60%;
    --chart-4: 38 92% 50%;
    --chart-5: 228 13% 60%;
  }
  body { @apply bg-background text-foreground antialiased; }
}
```

Add the NexusID-specific colours in `tailwind.config.ts → theme.extend.colors`: `surface`, `overlay`, `inset`, `success`, `warning`, `accent-text`, and `cat.{identity,education,employment,enrollment}`.

Tailwind v4: same values in `:root`, then map them with `@theme inline { --color-background: hsl(var(--background)); ... }` and add `--color-success`, `--color-cat-identity`, etc.

### 4.3 Packages

```bash
# in apps/web
npx shadcn@2.3.0 init        # or shadcn@latest on Tailwind v4
npx shadcn@2.3.0 add button input label card badge table dialog alert-dialog sheet tabs checkbox \
  dropdown-menu avatar separator skeleton tooltip sonner sidebar chart form progress scroll-area
npm i lucide-react motion qrcode.react date-fns
```

Zod note from `.claude/rules/web.md`: if `zodResolver` breaks with Zod v4, keep forms in shadcn `Form` but use Zod 3 in `apps/web` only.

---

## 5. The 6 signature components (build these well)

These carry the identity of the product. Everything else is plain shadcn.

### 5.1 `CredentialCard` (mobile + web)

The document look. SRS: "Credential cards look like identity documents".

```
┌──────────────────────────────────────────┐  radius 16, aspect 1.586 (ID-1 card ratio)
│▌ NATIONAL IDENTITY            ● VALID     │  ← 4 px left strip in category colour
│▌ NADRA Pakistan                           │     category label = eyebrow style, cat colour
│▌                                          │
│▌   [IdCard icon, 40 px, cat colour 15%]   │  ← faint guilloche pattern: repeating
│▌                                          │     45° lines, cat colour at 4% opacity
│▌ CONFIRMS                                 │
│▌ Age over 18 · Age over 21 · Pakistani    │  ← predicate labels (not raw values)
│▌                                          │
│▌ ID  cr_8f3a…91c2        EXPIRES 12/2027  │  ← mono, text-muted
└──────────────────────────────────────────┘
```

- Background: `surface` with a soft radial of the category colour at 8% in the top-right corner.
- Revoked: title struck through, whole card at 60% opacity, REVOKED badge.
- Expired: EXPIRED badge, expiry date in danger.
- Mobile wallet: cards overlap like Apple Wallet (each next card shifted 72 px down); tap → detail.
- Never shows raw attribute values on the card (the DOB etc. stay in the encrypted store).

### 5.2 `ConsentSheet` (mobile SCR-008)

The most important screen in the demo. Based on the EUDI "Request → Share" screen and Authenticator push.

```
          ━━━━  (sheet handle)
   [S]  Shop A                      ⏱ 1:42   ← countdown ring, warning < 30 s
        shop-a.demo · Verified business
   ───────────────────────────────────────
   WILL BE CONFIRMED
   ✓  Age over 18                     Yes
      AGE_OVER_18 · from NADRA Pakistan
   ───────────────────────────────────────
   NEVER SHARED
   👁‍🗨 Name · Date of birth · CNIC · Address   (EyeOff icon, text-muted)
   ───────────────────────────────────────
   Using: National Identity · NADRA · exp 12/2027
   
   [  Decline  ]   [ ◉ Approve with fingerprint ]   ← flex 1 : 2, primary = accent fill
```

- Approve opens the biometric prompt (FR-015) → on success go to `ProofStepper`.
- Decline → confirm dialog "Decline request from Shop A?" (Cancel / Decline request).
- At 0:00 the sheet greys out and shows "Request expired", only button "Close".

### 5.3 `ProofStepper` (mobile SCR-009)

```
   ●──────●──────○
   Checking   Generating   Sending
   credential   proof       to NexusID
```
Three steps, each ~400 ms minimum display time even if it's faster (so people can follow it), then a full-screen success: big drawn check, "Verified", "Shop A now knows you are over 18. Nothing else was shared.", button "Done". Failure: `CircleX`, the backend's reason, "Retry" while the window is open.

### 5.4 `QRPanel` (extension SCR-011, portal SCR-013)

- White QR on a white rounded square (QR needs contrast) inside a `surface` card, 200 px.
- Countdown ring around it (120 s, BR-002). At 0 the QR blurs and shows "Code expired · New code".
- Under it: status line with live dot: "Waiting for scan…" → "Scanned, confirming…" → "Paired ✓".
- Numbered steps next to it (portal) or below (popup): 1. Open NexusID on your phone 2. Tap Scan 3. Point at this code.

### 5.5 `LiveLogTable` (SP dashboard SCR-018)

Stripe-style table: **Time** (relative, absolute in tooltip) · **Session** (mono, truncated, copy on click) · **Condition** (`PredicateChip`) · **Outcome** (`OutcomeBadge`) · **Proof hash** (mono, first 10 chars).
- Polls every 2 s. New rows slide in and flash.
- Column header tooltip on the table title: "NexusID never sends personal data to Service Providers. Only the outcome." This is your BR-015 moment.

### 5.6 `CodeBlock` + `PredicateChip`

- `CodeBlock`: `inset` background, 1 px border, mono 13 px, top bar with a language label and a Copy button (lucide `Copy` → `Check` for 2 s, sonner toast "Copied").
- `PredicateChip`: pill in the category colour tint: `[GraduationCap] CGPA ≥ 3.0` with tooltip showing `CGPA_AT_LEAST_3_0`.

Predicate labels:

| Code | Label |
|------|-------|
| `AGE_OVER_18` | Age over 18 |
| `AGE_OVER_21` | Age over 21 |
| `NATIONALITY_PAKISTANI` | Pakistani national |
| `DEGREE_BACHELOR_OR_HIGHER` | Bachelor's degree or higher |
| `CGPA_AT_LEAST_2_0` | CGPA ≥ 2.0 |
| `CGPA_AT_LEAST_3_0` | CGPA ≥ 3.0 |
| `CGPA_AT_LEAST_3_5` | CGPA ≥ 3.5 |
| `ENROLLED_CURRENT` | Currently enrolled |
| `EMPLOYMENT_ACTIVE` | Currently employed |

Put this map in `packages/types` so web, mobile and extension share it.

---

## 6. Surfaces and screens

### 6.1 Web portal (`apps/web`)

**Shell:** shadcn `sidebar-07` block, collapsible, 240 px. Top bar 56 px with breadcrumb + avatar menu. Content padding 32 px.

| Screen | Layout | Reference |
|--------|--------|-----------|
| **Landing** `/` | Nav · hero (headline "Prove what matters. Hide what doesn't." + animated credential card where values blur into ✓ predicates) · "Old way vs NexusID" two cards · 3 steps · 4 issuers · code block for verifiers · footer "Air University Islamabad · FYP 2026" | Stripe, Linear, Resend |
| **SCR-012 Role selection** `/login` | Centred, two large cards: "I have credentials" (End User, `WalletCards`) / "I verify users" (Service Provider, `Building2`) | Stripe sign-in |
| **SCR-013 EU sign-in** | Split: `QRPanel` left, steps right, "Recover account" link | WhatsApp Web |
| **SCR-014 EU dashboard** | KPI row (credentials, verifications, paired browsers) · Paired browsers & devices list with Revoke · Recent activity | Linear |
| **SCR-015 EU history** | Table + filters (All / Verified / Declined / Expired) · row → side `Sheet` with details · Delete with `AlertDialog` | Stripe payments |
| **SCR-017 SP register/login** | `login-03` block, fields: platform name, email, password | shadcn blocks |
| **SCR-018 SP dashboard** | KPI row (Total · Verified · Failed/Declined/Expired · Success rate) · area chart "Verifications, last 7 days" · `LiveLogTable` · right column: "Integrate in 2 minutes" `CodeBlock` | Stripe home + Persona |
| **SCR-019 Requirements** | 4 category cards (colour strip), each with checkboxes for its predicates · sticky footer "Save requirements" · live preview chip row "Users will be asked to confirm: …" | Stripe settings |
| **SCR-020 API keys** | Table of keys (name, prefix `nx_live_8f3a••••`, created, last used) · "Create key" → dialog showing the full key **once** with Copy and the warning "You won't see this key again" · Rotate → `AlertDialog` "Rotate key? The current key stops working immediately." (BR-009) | Stripe API keys |

### 6.2 Mobile wallet (`apps/mobile`)

**Kit decision (for speed):**
- If `nativewind` is already in `apps/mobile/package.json` → add **React Native Reusables** components (button, card, dialog, badge, progress).
- If not → **don't add NativeWind now** (Babel/Metro setup can eat a day). Use `src/styles/tokens.ts` + small own components (`Button`, `Badge`, `Card`, `Sheet` via `@gorhom/bottom-sheet`) + `lucide-react-native` + `react-native-reanimated`.

**Navigation:** bottom tabs with labels (Wallet · History · Profile), and a centred floating Scan button (`ScanLine`, accent fill, 56 px). Tab bar `surface`, top border `border`.

| Screen | Spec | Reference |
|--------|------|-----------|
| SCR-001 Registration | Logo mark, 3 fields, "Create account". After submit: full-screen "Securing your device…" with a `Fingerprint`/`KeyRound` animation while the Keystore key is made (FR-002) | Revolut onboarding |
| Lock screen (FR-015) | Logo + "Unlock NexusID" + biometric prompt auto-opens | Banking apps |
| SCR-002 Wallet | Greeting "Your credentials" · stacked `CredentialCard`s · empty state "Add your first credential" with the 4 category icons | Apple Wallet |
| SCR-003 Detail | Large card at top · "Confirms" list of predicates · details (issuer, issued, expires, credential ID mono) · Update / Delete | Apple Wallet pass detail |
| SCR-004 Add credential | 2×2 category tiles with issuer names | Google Wallet "Add to wallet" |
| SCR-005 Attribute entry | Per-issuer form (NADRA: CNIC with mask → OTP 6 boxes; AU: registration no.; HEC: degree no.; LinkedIn: OAuth button) · processing screen "Verifying with NADRA…" · success card flies into wallet | Pak-ID |
| SCR-007 Scan | Full-screen camera, rounded square cutout with animated corners, label "Scan the code in your browser" | Any QR scanner |
| SCR-008 Request | `ConsentSheet` (§5.2) | EUDI wallet, Authenticator |
| SCR-009 Progress | `ProofStepper` (§5.3) | Payment confirmation |
| SCR-010 History | Grouped by day, rows: platform avatar letter · condition chip · outcome badge · time | Bank transactions |

### 6.3 Extension popup (`apps/extension`) — 360 × 560

Header: NexusID wordmark (DM Sans 600) + status dot. Body: one state at a time. Footer: "Open portal" link.

| State | Content |
|-------|---------|
| Not paired | `QRPanel` + "Pair your phone" |
| Paired, idle | `ShieldCheck` in a 64 px tile, "Ready", "Paired with Pixel 7 · Unpair" |
| Request detected | Platform name, `PredicateChip`, pulsing dot "Check your phone" |
| Verified | Drawn check, "Verified for Shop A", condition chip, time |
| Failed / Declined / Expired | Matching icon and colour from §3.2, one-line reason, "Dismiss" |

Desktop notification (FR-033): title "NexusID", body "Shop A asks: Age over 18 — check your phone".

### 6.4 Demo shop (`Shop A`)

Deliberately **light theme and a different style** (a normal e-commerce look: white, product image, price) so the NexusID widget clearly looks like a third-party integration on someone else's site.
Widget: dark NexusID card embedded on the page, "Verify your age with NexusID", status text, and on success a green banner "Age verified · no personal data shared", then the "Place order" button unlocks.

---

## 7. States (every screen has all four)

| State | Rule |
|-------|------|
| Loading | Skeletons in the shape of the content. No spinner if under 300 ms. Over 8 s → error with Retry |
| Empty | 64 px icon tile + title + one sentence + one action |
| Error | Specific message from the API (`error` field), Retry button. Never "Something went wrong" alone |
| Success | sonner toast bottom-right for small actions, full screen only for the proof result and credential added |

---

## 8. Copy guide

- Short and specific: "Credential added", "Key copied", "Request declined". No "successfully".
- Buttons say the action: "Approve with fingerprint", "Rotate key", "Delete credential". Never "Yes" / "OK" / "Confirm".
- Confirm dialogs: title = action question ("Delete this credential?"), body = consequence, buttons Cancel + action.
- Privacy line, repeated in key places: **"Only the answer is shared. Never your data."**
- Talk about conditions, not data: "Shop A wants to confirm you are over 18", not "Shop A wants your age".

---

## 9. Accessibility (SRS NFR-026, UI-003)

- Text contrast ≥ 4.5:1 (body), ≥ 3:1 (large). `text-faint` only for decorative metadata.
- Every status has a text label (§3.2). Every icon button has `aria-label` / `accessibilityLabel`.
- Visible focus ring: 2 px `accent`, 2 px offset on `bg`.
- Touch targets ≥ 44 px on mobile. Countdown announced at 30 s and 10 s (`aria-live="polite"`).
- Respect reduced motion.

---

## 10. Demo polish checklist (the details evaluators notice)

- [ ] Favicon + browser tab titles ("Dashboard · NexusID")
- [ ] Logo mark: rounded square, accent fill, white "N" in DM Sans 700. Same on web, extension icon (16/32/48/128) and the app icon
- [ ] Seeded data looks real: 20–30 past verifications over 7 days so charts aren't empty
- [ ] No `console` errors, no hydration warnings, no layout shift on fonts
- [ ] Session IDs and hashes in mono everywhere
- [ ] The SP dashboard row appears within 2 s of approving on the phone
- [ ] Phone in dark mode, notifications on, screen brightness up, Do Not Disturb off for NexusID
- [ ] Chrome zoom 110% when projecting

---

## 11. Claude Code prompts

The build prompts live in **`docs/DEMO_BUILD.md` §4**, so there is one ordered list:
Phase 2a (shadcn install) → 2b (shared components) → 3 (SP portal) → 4 (Shop A) → 5 (extension) → 6 (mobile) → 7 (End User portal) → 8 (polish).

For any single screen not covered there, use:
```
Build <SCR-0XX name> following docs/DESIGN.md §6.<n> and the references listed for it.
Use the shadcn components and the signature components from §5, the states from §7 and the copy rules from §8.
Wire it to <API-0XX…> from docs/REQUIREMENTS.md. Then open it in the browser, compare against the spec, and fix gaps.
```

---

## 12. v2.1 refinements (2026-11-26, UI polish pass)

These override the matching lines above. Hex tokens are unchanged.

- **No coloured left strips on cards.** Category colour now shows through a tinted icon emblem, label text and the card's radial glow. Applies to `CredentialCard` (web + mobile), requirements, landing issuers, add-credential sources.
- **CredentialCard composition:** emblem + category label · status (top), issuer name in DM Sans 18–20 + "Verifiable credential · SD-JWT" with a small contact-chip graphic (middle), predicate chips (one row), mono `ID` / `EXP` footer under a hairline. No large icon tile.
- **KPIs:** `StatGroup` — one bordered strip with hairline dividers (Stripe-style), 2 columns on phones, 3–4 on desktop. Semantic KPIs get a 6 px dot instead of an icon tile.
- **Active nav:** `overlay` fill + 1 px border + accent-text icon (was a solid accent block). Accent fill stays for primary buttons and the mobile Scan button.
- **Page headings:** every portal page uses `PageHeader` (title, one line, actions). The top bar is a breadcrumb (`Wallet / History`), never a second title.
- **Responsive web:** grids are `grid-cols-1` first (`minmax(0,1fr)`), so long text can't widen the page. Tables collapse on phones (log table → stacked rows; secondary columns hidden below `sm`/`md`/`lg`). Content max width 1200 px, 1360 px from `2xl`. Checked at 360, 390, 768, 1024, 1280 and 1920 px with no horizontal scroll.
- **Mobile tab bar:** Wallet · **Scan** · History · Profile. Scan is an accent pill **inside** the bar, never floating over content.
- **Mobile layout:** `src/styles/layout.ts` `useLayout()` → `compact` (≤ 360 dp wide or < 700 dp tall), `wide` (≥ 600 dp: content capped at 520 dp and centred). Checked at 360×640, 411×914 and 800×1280 dp.
- **ConsentSheet:** buttons stack (Approve full width on top) below 400 dp; the sheet scrolls if it is taller than the screen.
- **Profile:** grouped settings rows, not a stack of buttons.
