---
name: verify-flow
description: End-to-end check of the credential lifecycle - issue, hold, request, selectively disclose, verify, audit. Use before a demo and after any change to sd-jwt or the issuers.
disable-model-invocation: true
allowed-tools: Bash(npm *) Bash(npx *) Bash(node *) Bash(curl *)
model: opus
effort: high
---

Walk the full lifecycle and report pass/fail per step:

1. Issue a credential from one issuer to a test holder.
2. Verifier creates a verification request for a single claim only.
3. Holder produces a presentation disclosing that claim and nothing else.
4. Verifier verifies: signature, key binding, nonce, audience, expiry.
5. Confirm an undisclosed claim is not recoverable from the presentation.
6. Confirm the audit record was written, and the flow still succeeds with
   blockchain service unavailable (fail-silent write, fail-open revocation).
7. Confirm the ML fraud check ran and its result did not block issuance.

Any step that cannot be run from the shell: say so explicitly rather than marking it passed.
