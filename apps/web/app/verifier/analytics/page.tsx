import { redirect } from "next/navigation";

// The 7-day chart and totals now live on the dashboard (SCR-018).
export default function Page() {
  redirect("/verifier/dashboard");
}
