import { backendProxy } from "@/lib/backendProxy";

// Pairings (SRS API-026, API-027 / FR-038): list and revoke paired browsers.
const handler = backendProxy("pairings");

export const GET = handler;
export const DELETE = handler;
