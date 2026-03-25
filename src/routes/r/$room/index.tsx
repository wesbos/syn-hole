import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/")({
  head: ({ params }) => ({
    meta: [{ title: `${formatRoomName(params.room)} Audience | Syntax Live Polls` }],
  }),
  component: AudienceRoute,
});

function AudienceRoute() {
  const { room } = Route.useParams();
  return <PollPage view="audience" room={room} />;
}

function formatRoomName(room: string) {
  return room
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}
