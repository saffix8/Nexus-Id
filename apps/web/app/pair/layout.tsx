import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pair browser" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
