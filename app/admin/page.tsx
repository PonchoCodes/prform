import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";

// The page guard is the second lock, not the only one: both admin APIs this
// page calls refuse a non-admin independently, because a page guard protects
// a page and not the data behind it.
export default async function AdminPage() {
  if (!(await isAdminSession())) redirect("/");

  return <AdminConsole />;
}
