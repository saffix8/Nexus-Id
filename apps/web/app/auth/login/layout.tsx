import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Sign in", template: "%s · NexusID" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
