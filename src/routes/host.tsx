import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host")({
  beforeLoad: () => {
    throw redirect({ to: "/r/$room/host", params: { room: "main-stage" } });
  },
});
