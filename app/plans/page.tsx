import { redirect } from "next/navigation";

/** Keep old plan links pointed at the Plan & usage settings page. */
export default function PlansRoute() {
  redirect("/pricing");
}
