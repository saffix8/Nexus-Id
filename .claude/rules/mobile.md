---
paths:
  - "apps/mobile/**/*.{ts,tsx}"
---

# Mobile rules
SRS reference: MOD-1, MOD-2, MOD-3, MOD-4, MOD-5, MOD-6, CON-008, CON-009

- The private key never leaves Android Keystore / iOS Secure Enclave. All
  signing goes through CryptoService. Never pass or log a PEM, and never add a
  code path that exports a private key.
- react-native-biometrics returns the public key only at creation time — cache
  it via StorageService in the same function that creates the key.
- Zustand store actions use lazy `await import(...)` for cross-store calls.
- Storage is SQLite for records and encrypted keychain for secrets. Never put a
  secret in AsyncStorage or in a Zustand persisted slice.
- This app cannot be run or tested from this machine's shell. Verify by reading
  the code and type-checking; do not claim a screen works.
