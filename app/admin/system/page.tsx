import { SystemView } from "@/components/admin/system-view";
import { SYSTEM_INVENTORY } from "@/lib/admin/system-inventory";

export default function AdminSystemPage() {
  return <SystemView inventory={SYSTEM_INVENTORY} />;
}
