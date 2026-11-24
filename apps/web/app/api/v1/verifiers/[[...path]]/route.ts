import { backendProxy } from "@/lib/backendProxy";

// Service Provider portal: profile, API key (API-043/044), requirements
// (API-045/046), verification log. Uses the provider session cookie.
const handler = backendProxy("verifiers", { session: "verifier" });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
