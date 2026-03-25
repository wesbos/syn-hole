/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "~/styles.css?url";
import normalizeCss from "~/normalize.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { title: "Syntax Live Polls" },
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, shrink-to-fit=no",
      },
      { httpEquiv: "X-UA-Compatible", content: "IE=edge" },
      {
        name: "description",
        content:
          "Realtime conference polling with Cloudflare Workers and PartyServer.",
      },
      { name: "author", content: "Syntax" },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "stylesheet", href: normalizeCss },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "https://syntax.fm/favicon.ico", sizes: "any" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
