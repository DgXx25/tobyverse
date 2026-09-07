import { AccountWorkspace } from "@/components/account/account-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account · TobyVerse",
};

export default function AccountPage() {
  return <AccountWorkspace />;
}
