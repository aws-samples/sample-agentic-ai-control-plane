import { auth } from "@package/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SignInClient from "./page-client";

export default async function SignInPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/dashboard");
  }

  return <SignInClient />;
}
