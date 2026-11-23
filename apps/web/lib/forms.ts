// apps/web/lib/forms.ts
//
// react-hook-form + Zod v4 without @hookform/resolvers (incompatible with
// Zod v4 — see CLAUDE.md). Validates with safeParse and maps issues onto the
// form via setError.

import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { z } from "zod";

/** Returns the parsed data, or null after reporting every issue on the form. */
export function parseForm<T extends FieldValues, S extends z.ZodType>(
  schema: S,
  data: T,
  setError: UseFormSetError<T>,
): z.infer<S> | null {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string") {
      setError(field as Path<T>, { message: issue.message });
    }
  }
  return null;
}
