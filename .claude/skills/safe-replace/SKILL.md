---
name: safe-replace
description: Regenerate a file that repeated failed patches have damaged, as one complete replacement with a backup first.
argument-hint: [path/to/file.ts]
arguments: [path]
disable-model-invocation: true
---

The file is $path.

1. Read it whole and report what is wrong: stray escape sequences, duplicated
   blocks, truncation, unbalanced braces.
2. Copy it to $path.bak before touching anything.
3. Reconstruct the complete file from its real imports, callers and project
   conventions. Preserve existing behaviour exactly — this is a repair, not a refactor.
4. Show me the complete file and wait for approval. Do not write first.
5. After I approve: write it, then `npx tsc --noEmit` on its workspace and
   `npm test -w services/backend`.
