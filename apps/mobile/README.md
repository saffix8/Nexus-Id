# NexusID Android wallet (`apps/mobile`)

React Native 0.88 (new architecture, Hermes). **Standalone install** — not part of the root npm
workspace, because it needs React 19 and `apps/web` is on React 18. The shared packages are linked
with `file:` (`@nexusid/types`, `@nexusid/sd-jwt`).

## Run

```bash
cd apps/mobile
nvm use            # Node 22 (.nvmrc) — RN 0.88 needs >= 22.11
npm install --no-workspaces
npm start          # Metro
npm run android    # in a second terminal; needs JAVA_HOME (Android Studio's jbr) and ANDROID_HOME
```

The backend URL defaults to `http://10.0.2.2:4000/api/v1` (the host from the emulator). On a real
phone change `src/config.ts` to the laptop's LAN IP.

The emulator needs a fingerprint (or at least a screen lock) enrolled: Settings → Security.
Emulator fingerprint touch: `adb -e emu finger touch 1`.

## Structure

| Path | What |
|------|------|
| `src/styles/tokens.ts` | DESIGN.md §3 tokens (colour, type, space, motion) |
| `src/ui/` | Small own kit: Button, StatusBadge, Card, TextField, ConfirmDialog, CountdownRing, Toast… |
| `src/components/` | Signature components: CredentialCard (§5.1), ConsentSheet (§5.2), ProofStepper (§5.3) |
| `src/screens/` | SignIn, Lock (FR-015), Wallet, CredentialDetail, AddCredential, Scan, Request, Proof, History, Profile |
| `src/navigation/` | Root stack + bottom tabs with the floating Scan button; pending-request polling |
| `src/services/` | Keystore, crypto, storage, API — key generation and signing live here (unchanged by the UI) |

Fonts (DM Sans, Inter, JetBrains Mono — OFL) are bundled in `android/app/src/main/assets/fonts`.
