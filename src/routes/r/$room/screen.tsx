import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/screen")({
  component: ScreenRoute,
});

function ScreenRoute() {
  const { room } = Route.useParams();
  return <PollPage view="projector" room={room} />;
}
