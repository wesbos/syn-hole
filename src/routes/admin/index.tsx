import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "~/components/admin";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Admin | Syntax Live Polls" }],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  return <AdminPage />;
}
