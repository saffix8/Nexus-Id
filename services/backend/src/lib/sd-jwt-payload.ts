// services/backend/src/lib/sd-jwt-payload.ts
//
// Reads (does NOT verify) the issuer-signed JWT payload of an SD-JWT
// "<header>.<payload>.<signature>~<disclosure>~...". Used to route to the
// right issuer key and to look up the credential's revocation status by its
// `jti`. Signature verification is done by @nexusid/sd-jwt verifyProof.

export function decodeSdJwtPayload(sdJwt: string): Record<string, unknown> | null {
  const segments = sdJwt.split("~")[0].split(".");
  if (segments.length < 3) return null;

  try {
    const json = Buffer.from(segments[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The credential's `jti` claim, or null if absent/unreadable. */
export function sdJwtCredentialId(sdJwt: string): string | null {
  const jti = decodeSdJwtPayload(sdJwt)?.["jti"];
  return typeof jti === "string" && jti ? jti : null;
}
