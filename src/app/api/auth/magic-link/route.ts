import { z } from "zod";
import { clientIp, rateLimit, route } from "@/lib/api";
import { issueMagicLink } from "@/lib/magic";

const Body = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address."), client: z.enum(["web", "app"]).default("app") });

/** POST {email, client} → always {ok:true}; a link is emailed when the address has an account. */
export const POST = route(async (req) => {
  const body = Body.parse(await req.json());
  rateLimit(`ml:${clientIp(req)}`, 10);
  rateLimit(`ml:${body.email}`, 5, 15 * 60_000);
  return issueMagicLink(body.email, body.client);
});
