# NexusID — Architecture

This should expand the "FULL SYSTEM ARCHITECTURE" diagram and "KEY DECISIONS
& RATIONALE" section from NEXUSID_PROJECT.md into a standalone document —
useful to hand to your FYP evaluators separately from the full project file.

Recommended sections:
- System diagram (copy from NEXUSID_PROJECT.md)
- SD-JWT flow (issuer → holder → verifier) with sequence diagram
- Trust model (why centralized relay, not blockchain-first)
- Data flow: what the backend stores vs. what stays on-device
- Threat model summary (replay protection, key binding, revocation)
