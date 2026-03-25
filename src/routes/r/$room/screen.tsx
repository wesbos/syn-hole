import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/screen")({
  head: ({ params }) => ({
    meta: [{ title: `${formatRoomName(params.room)} Screen | Syntax Live Polls` }],
  }),
  component: ScreenRoute,
});

function ScreenRoute() {
  const { room } = Route.useParams();
  return <PollPage view="projector" room={room} />;
}

function formatRoomName(room: string) {
  return room
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}
