import { createFileRoute } from "@tanstack/react-router";
import { PollPage } from "~/components/poll";

export const Route = createFileRoute("/r/$room/")({
  component: AudienceRoute,
});

function AudienceRoute() {
  const { room } = Route.useParams();
  return <PollPage view="audience" room={room} />;
}
