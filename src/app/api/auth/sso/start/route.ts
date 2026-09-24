import { NextResponse } from "next/server";
import { bad, route } from "@/lib/api";
import { findSsoCompany, startSso } from "@/lib/sso";

/** GET ?email=…|code=…&client=web|app → redirect to the company's identity provider. */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const company = await findSsoCompany({ email: q.get("email") ?? undefined, code: q.get("code") ?? undefined });
  if (!company) throw bad("sso_unknown", "No company SSO found for this email. Try your company code or a sign-in link.");
  const url = await startSso(company.id, q.get("client") === "web" ? "web" : "app");
  if (q.get("json")) return { url };
  return NextResponse.redirect(url);
});
