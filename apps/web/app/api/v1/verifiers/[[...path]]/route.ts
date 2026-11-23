import { backendProxy } from "@/lib/backendProxy";

// Service Provider portal: profile, API key rotation, verification log
// (SRS FR-033, FR-034). Uses the provider session cookie, not the user one.
const handler = backendProxy("verifiers", { session: "verifier" });

export const GET = handler;
export const POST = handler;
