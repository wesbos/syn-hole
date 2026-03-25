import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/host")({
  head: ({ params }) => ({
    meta: [{ title: `${formatRoomName(params.room)} Host | Syntax Live Polls` }],
  }),
  component: HostRoute,
});

function HostRoute() {
  const { room } = Route.useParams();
  return <PollPage view="host" room={room} />;
}

function formatRoomName(room: string) {
  return room
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}
