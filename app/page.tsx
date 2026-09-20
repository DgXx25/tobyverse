import { cookies } from "next/headers";
import { PublicHome } from "@/components/public-home";
import { SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

export default async function HomePage() {
  const sessionHint = (await cookies()).get(SIGNED_IN_COOKIE)?.value === "1";
  return <PublicHome sessionHint={sessionHint} />;
}
