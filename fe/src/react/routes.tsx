/* Definisi rute, dipakai bersama klien (createBrowserRouter) dan server
   (createStaticHandler). Loader hanya dipasang di rute yang butuh data di
   server; /katalog dan konsultan tetap client-only, compare/detail sementara
   lewat island-adapter. */
import type { RouteObject } from "react-router";
import { RootLayout } from "./App.tsx";
import { LegacyRoute } from "./LegacyRoute.tsx";
import { CatalogRoute } from "./routes/catalog.tsx";
import { compareView } from "./routes/compare.tsx";
import { ConsultRoute } from "./routes/consult.tsx";
import { detailView } from "./routes/detail.tsx";
import { HomeRoute, homeLoader } from "./routes/home.tsx";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    // Dirender saat pemuatan klien awal tanpa data hidrasi (mis. rute berloader
    // yang tidak di-SSR). null saja: latar gelap inline sudah menutupi jeda
    // singkat sampai loader selesai. Tanpa ini react-router memperingatkan.
    HydrateFallback: () => null,
    children: [
      { index: true, element: <HomeRoute />, loader: homeLoader },
      { path: "katalog", element: <CatalogRoute /> },
      { path: "konsultan", element: <ConsultRoute /> },
      { path: "parfum/:slug", element: <LegacyRoute loader={(p) => detailView({ slug: p.slug! })} /> },
      { path: "bandingkan/:a/vs/:b", element: <LegacyRoute loader={(p) => compareView({ a: p.a!, b: p.b! })} /> },
    ],
  },
];
