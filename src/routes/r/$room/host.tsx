import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/host")({
  component: HostRoute,
});

function HostRoute() {
  const { room } = Route.useParams();
  return <PollPage view="host" room={room} />;
}
