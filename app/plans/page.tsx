import type { Metadata } from "next";
import { PlansPage } from "@/components/account/plans-page";

export const metadata: Metadata = { title: "Plans · TobyVerse" };

export default function PlansRoute() {
  return <PlansPage />;
}
