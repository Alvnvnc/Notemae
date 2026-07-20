/* Titik masuk SSR. Dibangun terpisah oleh Vite (prod: dist/server; dev:
   vite.ssrLoadModule) karena Node type-stripping tidak mentransform JSX.

   Merender pohon React yang sama dengan klien lewat createStaticHandler +
   renderToString. hydrate={false}: skrip data hidrasi TIDAK ditanam di dalam
   #root (biar isinya persis cocok dengan render klien = hidrasi bersih);
   server.ts yang menanamnya sebagai skrip saudara. */
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { getLocale, t } from "../lib/i18n.ts";
import { routes } from "./routes.tsx";

const handler = createStaticHandler(routes);

type Meta = { title: string; desc: string; stage: boolean };
const META: Record<string, () => Meta> = {
  "/": () => ({ title: "", desc: t("home.lede"), stage: true }),
  "/konsultan": () => ({ title: t("nav.consultant"), desc: t("home.consultLede"), stage: false }),
};

export interface SsrResult {
  html: string;
  hydrationData: unknown;
  title: string;
  desc: string;
  stage: boolean;
  locale: string;
}

export async function render(url: string): Promise<SsrResult> {
  const context = await handler.query(new Request(url));
  if (context instanceof Response) throw new Error(`ssr expected context, got response ${context.status}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  const meta = (META[pathname] ?? META["/"]!)();
  const hydrationData = { loaderData: context.loaderData, actionData: context.actionData, errors: context.errors };
  return { html, hydrationData, locale: getLocale(), ...meta };
}
