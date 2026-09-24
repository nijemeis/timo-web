import { VerifyLink } from "@/components/auth/VerifyLink";

export const metadata = { title: "Signing in · Timo" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyLink token={token ?? ""} />;
}
