import { backendProxy } from "@/lib/backendProxy";

// Service Provider dashboard analytics (API-047/048, FR-042) with the provider
// session cookie. The backend also accepts the SP's API key for server use.
export const GET = backendProxy("analytics", { session: "verifier" });
