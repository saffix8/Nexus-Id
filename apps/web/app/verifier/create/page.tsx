import { redirect } from "next/navigation";

// Replaced by /verifier/requirements (SCR-019).
export default function Page() {
  redirect("/verifier/requirements");
}
