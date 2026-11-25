// `process.env` is referenced for an optional API_URL override (src/config.ts,
// api.service.ts); React Native's types don't declare `process`.
declare const process: { env: Record<string, string | undefined> };
