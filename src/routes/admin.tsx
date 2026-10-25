import { createFileRoute } from "@tanstack/react-router";

import { AdminApp } from "@/components/admin/admin-app";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Owner dashboard | Providence Rentals" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <main className="min-h-dvh">
      <AdminApp />
    </main>
  );
}
