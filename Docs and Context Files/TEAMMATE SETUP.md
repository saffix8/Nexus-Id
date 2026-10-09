# NexusID — Teammate Setup Guide

Follow this top to bottom and you'll have the same environment Safi runs. Budget about 1–2 hours for the base setup (web + backend + issuers), plus extra time if you also want mobile, blockchain, or ZKP.

Replace `<REPO_URL>` with the repo link Safi shares with you.

---

## 0. What you're running

| Part | Location | Port |
|---|---|---|
| Backend API (Express + Prisma) | `services/backend` | 4000 |
| NADRA issuer | `services/issuers/nadra` | 4001 |
| HEC issuer | `services/issuers/hec` | 4002 |
| Air University issuer | `services/issuers/air-university` | 4003 |
| LinkedIn issuer | `services/issuers/linkedin` | 4004 |
| Web app (Next.js 14) | `apps/web` | 3000 |
| ML fraud service (Flask) | `services/ml` | 5001 |
| PostgreSQL 16 | Docker | 5432 |
| Chrome extension | `apps/extension` | — |
| Mobile app (React Native) | `apps/mobile` | — |

---

## 1. Install the essential tools

### Required for everyone

| Tool | Version | Why |
|---|---|---|
| **Git** | latest | Clone the repo |
| **Node.js** | **20 LTS** | Everything TypeScript |
| **npm** | comes with Node 20 | Workspaces |
| **Docker Desktop** | latest | PostgreSQL + full stack |
| **VS Code** | latest | Editor |
| **Google Chrome** | latest | Load the extension |

Recommended: install Node through **nvm** (macOS/Linux) or **nvm-windows** so everyone stays on 20.

```bash
nvm install 20
nvm use 20
node -v    # must print v20.x.x
```

### Windows users

Use **WSL2 (Ubuntu)** for the terminal. It avoids most path and shell-script problems (`scripts/demo.sh` is a bash script).

```powershell
wsl --install
```

Then install Node, Git, and Docker integration inside WSL. In Docker Desktop, enable *Settings → Resources → WSL Integration* for your Ubuntu distro. Keep the repo inside the WSL filesystem (`~/nexusid`), **not** under `/mnt/c/...`, or installs and file watching will be very slow.

### Only if you work on these parts

| Part | Extra tools |
|---|---|
| ML service | **Python 3.11**, pip |
| Mobile app | **JDK 17**, **Android Studio** (SDK + an emulator), React Native environment setup for Android |
| ZKP circuits | **circom 2.x** CLI (needs Rust), `snarkjs` (`npm i -g snarkjs`) |
| Blockchain audit trail | Docker with **8 GB RAM minimum** allocated, Hyperledger Fabric 2.5 samples |
| Air University scraper | Puppeteer downloads Chromium on `npm install`; on Linux/WSL you may need extra libs (see Troubleshooting) |

### Verify

```bash
git --version
node -v
npm -v
docker --version
docker compose version
```

---

## 2. Get the code

```bash
git clone <REPO_URL> nexusid
cd nexusid
```

> If Safi published Docker images to a container registry instead of (or as well as) source code, ask him for the `docker login` and pull commands. For active development you still need the source repo, because the services run with hot reload.

---

## 3. Install dependencies

From the repo root (this installs every workspace):

```bash
npm install
```

Then build the shared packages once, since the apps import them:

```bash
npm run build --workspace=@nexusid/types
npm run build --workspace=@nexusid/sd-jwt
```

If a workspace has no `build` script yet, skip it. Ask Safi which packages need a build step, since the setup can differ.

---

## 4. Environment variables

`.env` files are gitignored, so you must create them. **Never commit them.**

### 4.1 Backend

```bash
cp .env.example services/backend/.env
```

Edit `services/backend/.env`:

```bash
DATABASE_URL=postgresql://nexusid:nexusid_dev_password@localhost:5432/nexusid_db
JWT_SECRET=<any long random string>
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=development

# Issuers (use sandbox / placeholders for local dev)
NADRA_USE_SANDBOX=true
ML_SERVICE_URL=http://localhost:5001
FABRIC_CHANNEL=nexusid-channel
FABRIC_CHAINCODE=credential-audit
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4.2 Secrets Safi must share privately

Do **not** send these through the repo. Use a password manager or a private message.

- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` (push notifications)
- `apps/mobile/android/app/google-services.json` (mobile push)
- `NADRA_CLIENT_ID`, `NADRA_CLIENT_SECRET`, `NADRA_FRANCHISE_CODE` (if real sandbox access exists)
- `HEC_API_KEY`, `HEC_BASE_URL`
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`

Without the Firebase values, push notifications won't work but the rest of the backend still runs.

### 4.3 Web app

Create `apps/web/.env.local`:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<any long random string>
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME=NexusID
```

### 4.4 Mobile

Create `apps/mobile/.env`:

```bash
API_URL=http://10.0.2.2:4000/api/v1
FIREBASE_WEB_API_KEY=<from Safi>
```

`10.0.2.2` is how the Android **emulator** reaches your computer's localhost. For a **physical phone**, use your computer's LAN IP instead (for example `http://192.168.1.20:4000/api/v1`) and keep both on the same Wi-Fi.

---

## 5. Start the database

```bash
docker compose -f infra/docker-compose.yml up -d postgres
docker ps    # confirm the postgres container is healthy
```

If port 5432 is already used by a local PostgreSQL install, stop that service or change the host port mapping.

---

## 6. Database migrations and seed data

```bash
cd services/backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ../..
```

The seed inserts the four issuers into `issuer_registry`, a demo verifier, and a demo user.

To inspect data visually:

```bash
cd services/backend && npx prisma studio
```

---

## 7. Generate issuer keys

Issuer private keys are gitignored, so every teammate generates their own. The script also writes the matching public keys into your local `issuer_registry`.

```bash
npx tsx scripts/generate-issuer-keys.ts
```

Run this **after** the seed. If you ever reset the database, run it again, because the registry public keys must match the private keys on disk or proof verification fails.

---

## 8. Run everything

Open one terminal per service.

```bash
# 1. Backend
cd services/backend && npm run dev

# 2–5. Issuers
cd services/issuers/nadra && npm run dev
cd services/issuers/hec && npm run dev
cd services/issuers/air-university && npm run dev
cd services/issuers/linkedin && npm run dev

# 6. Web app
cd apps/web && npm run dev

# 7. ML fraud service (optional)
cd services/ml
python -m venv .venv
source .venv/bin/activate        # Windows (non-WSL): .venv\Scripts\activate
pip install -r requirements.txt
python train.py                  # first time only, creates models/fraud_model.pkl
python app.py
```

**Shortcut:** the repo includes `scripts/demo.sh`, which starts Docker, waits for Postgres, runs migrations and seed, and generates keys.

```bash
bash scripts/demo.sh
```

### Check it works

```bash
curl http://localhost:4000/health
# -> {"status":"ok","timestamp":"..."}
```

Then open http://localhost:3000, register an account, and confirm the dashboard loads.

---

## 9. Load the Chrome extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `apps/extension/` folder
4. Open a page containing `<div id="nexusid-verify" ...>` (the demo page is `demo/test-verifier.html` if it exists in the repo)
5. Debug with the extension's **service worker** console (from the extensions page) and the page's DevTools console (content script)

After editing extension files, click the refresh icon on the extension card.

---

## 10. Run the mobile app (Android)

Only needed if you're working on mobile.

1. Install Android Studio and create an emulator (Pixel, recent API level).
2. Set `ANDROID_HOME` and add `platform-tools` to your PATH.
3. Get `google-services.json` from Safi and place it in `apps/mobile/android/app/`.
4. Make sure `apps/mobile/.env` exists.

```bash
cd apps/mobile
npm install
npx react-native start           # Metro bundler, terminal A
npx react-native run-android     # terminal B, emulator must be running
```

Check first: the mobile `package.json` may not have every React Native dependency finalized yet. If install or build fails on missing packages, tell Safi so the file can be fixed once for everyone.

---

## 11. Run the tests

```bash
cd services/backend
npm test
```

The integration suite exercises the real SD-JWT flow (no crypto mocking). Everyone should get all tests passing before making changes. If they don't, fix your environment first.

---

## 12. Git workflow for the team

```bash
git checkout -b feature/<your-name>-<short-topic>
# work, commit often
git add .
git commit -m "[P4] Add settings page"
git push -u origin feature/<your-name>-<short-topic>
```

Rules that keep the repo healthy:

- Pull before you start: `git pull origin main`.
- Open a pull request; don't push straight to `main`.
- One module per branch. Don't reformat files you aren't working on.
- Commit message format: `[P{phase}] short description`.
- After pulling changes that touch `package.json` or `prisma/schema.prisma`, run `npm install` and `npx prisma migrate dev`.

### Code conventions (please follow these)

- Strict TypeScript, **no `any`**.
- Validate every route input with **Zod**.
- Keep route handlers thin; business logic goes in service classes.
- Don't duplicate auth logic. Mobile uses the RSA challenge flow under `/api/v1/users/*`; web uses email/password under `/api/v1/auth/*`.
- Zod is v4 here. `@hookform/resolvers` doesn't work with it, so forms use manual `safeParse` + `setError` instead of `zodResolver`.
- Never mock crypto in tests.

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE` on 4000 / 3000 / 5432 | Something else holds the port. `docker ps` for stale containers (`docker stop <name>`), or `lsof -i :4000` (macOS/Linux) / `netstat -ano \| findstr :4000` (Windows). |
| `Cannot find module '@nexusid/sd-jwt/issuer'` | The `@nexusid/sd-jwt` package needs a subpath `exports` map in its `package.json`. Ask Safi whether this fix has been pushed, and pull the latest `main`. |
| `prisma.users is undefined` | Model names are singular in the client: `prisma.user`, `prisma.auditLog`. |
| Prisma errors after pulling | `cd services/backend && npx prisma generate && npx prisma migrate dev` |
| Proof verification fails after resetting the DB | Rerun `npx tsx scripts/generate-issuer-keys.ts` so registry keys match your private keys. |
| Zod errors like `.errors is undefined` | Zod v4 uses `.issues`, and `z.record()` takes two arguments. |
| Garbled characters or weird `^[[200~` in a file after pasting into a terminal | Bracketed-paste escape sequences got into the file. Use an editor to paste, not `cat > file` in the terminal. |
| Puppeteer can't launch Chromium on Linux/WSL | `sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2t64` |
| Android emulator can't reach backend | Use `10.0.2.2`, not `localhost`. Confirm the backend is running and your firewall allows port 4000. |
| Docker is slow or out of memory | Docker Desktop → Settings → Resources; give it 8 GB+ if you're running Fabric. |
| Firebase / push not working | Missing service account values in `services/backend/.env` or missing `google-services.json`. Ask Safi. |

---

## 14. Quick reference

```bash
# Start DB
docker compose -f infra/docker-compose.yml up -d postgres

# Whole stack in Docker
docker compose -f infra/docker-compose.yml up -d

# Reset DB completely (destroys local data)
cd services/backend && npx prisma migrate reset

# Stop everything
docker compose -f infra/docker-compose.yml down
```

If something isn't covered here, send Safi the **exact terminal output** (not a description), the file path, and the command you ran.
