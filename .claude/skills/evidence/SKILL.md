---
name: evidence
description: Diagnose a NexusID failure from pasted terminal output or a stack trace and return one proposed fix.
argument-hint: [paste the error output]
context: fork
agent: evidence-debugger
background: false
model: inherit
---

The failure to diagnose:

$ARGUMENTS

Follow your method exactly. Read the real files in the trace, confirm state
with read-only commands, check memory for a known fingerprint, then give me:
root cause with file and line, one proposed change as a diff or complete file,
every consumer affected, and the single command that verifies it.

If I pasted nothing above, ask me for the exact command I ran and its full output.
