import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminWaitlist } from "./AdminWaitlist";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail || session?.user?.email !== adminEmail) {
    redirect("/");
  }

  return <AdminWaitlist />;
}
