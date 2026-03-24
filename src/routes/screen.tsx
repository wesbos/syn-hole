import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/screen")({
  beforeLoad: () => {
    throw redirect({ to: "/r/$room/screen", params: { room: "main-stage" } });
  },
});
