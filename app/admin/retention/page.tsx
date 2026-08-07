import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminRetention } from "./AdminRetention";

// Guarded twice, on purpose. This page redirects anyone who is not the admin,
// and /api/admin/retention refuses them independently — a page guard alone
// protects the page, not the data, and the data is the sensitive part.

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  const session = await getServerSession(authOptions);
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail || session?.user?.email !== adminEmail) {
    redirect("/");
  }

  return <AdminRetention />;
}
