---
name: fyp-status
description: Audit what is actually built versus what the docs claim, and refresh the file map and open-items list.
disable-model-invocation: true
model: opus
effort: high
---

Compare the real tree against docs/REQUIREMENTS.md. Produce:

1. Components complete, with the file that proves it.
2. Components the docs claim but the code does not have.
3. Files that exist but are empty, stubbed or unreferenced.
4. Open items, ranked by what blocks the defense demo.

Then show me the diff before writing anything.
