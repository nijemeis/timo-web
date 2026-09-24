import { AppBounce } from "@/components/auth/AppBounce";

export const metadata = { title: "Open in Timo" };

/** The app's magic link lands here and bounces into timo://auth?token=… on the phone. */
export default async function MobileBounce({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AppBounce token={token} />;
}
