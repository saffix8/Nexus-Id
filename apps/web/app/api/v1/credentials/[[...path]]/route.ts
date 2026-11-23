import { backendProxy } from "@/lib/backendProxy";

const handler = backendProxy("credentials");

export const GET = handler;
export const POST = handler;
