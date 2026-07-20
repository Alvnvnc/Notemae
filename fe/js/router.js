/* Router History API dengan URL bersih (KNF-12): /, /katalog, /parfum/:slug,
   /bandingkan/:a/vs/:b. server.js melayani fallback ke index.html.
   Setiap rute memperbarui <title> + meta description. */

import { curtainSwap, killViewTriggers, revealWithin, scrollToTop, refreshTriggers, scrollToEl } from "./motion.js";

const routes = [];
let viewEl = null;
let current = { path: null, cleanup: null };
let firstRender = true;

export function refreshCurrentRoute() {
  return renderPath(location.pathname.replace(/\/+$/, "") || "/", location.hash);
}

export function defineRoute(pattern, loader) {
  // pattern: "/parfum/:slug" -> regex bernama
  const names = [];
  const rx = new RegExp(
    "^" +
      pattern
        .replace(/\/$/, "")
        .replace(/:[a-zA-Z]+/g, (m) => {
          names.push(m.slice(1));
          return "([^/]+)";
        }) +
      "/?$"
  );
  routes.push({ rx, names, loader });
}

function match(path) {
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (m) {
      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { loader: r.loader, params };
    }
  }
  return null;
}

function setMeta(title, desc) {
  document.title = title ? `${title} | ScentSphere` : "ScentSphere | Perfume Dupe Guide";
  const meta = document.querySelector('meta[name="description"]');
  if (meta && desc) meta.setAttribute("content", desc);
}

function markNav(path) {
  document.querySelectorAll(".masthead .nav-link").forEach((a) => {
    const href = a.getAttribute("href").split("#")[0] || "/";
    if (href !== "/" && path.startsWith(href)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function renderPath(path, hash) {
  const found = match(path) || match("/");
  const view = await found.loader(found.params);

  const swap = async () => {
    if (current.cleanup) { try { current.cleanup(); } catch { /* view lama */ } }
    killViewTriggers();
    viewEl.innerHTML = view.html;
    document.body.setAttribute("data-stage", view.stage ? "on" : "off");
    if (window.ScentBG) window.ScentBG.setPaused(!view.stage);
    setMeta(view.title, view.desc);
    markNav(path);
    scrollToTop(true);
    current = { path, cleanup: null };
    if (view.mount) current.cleanup = (await view.mount(viewEl)) || null;
    revealWithin(viewEl);
    refreshTriggers();
    if (hash) {
      const target = viewEl.querySelector(hash);
      if (target) setTimeout(() => scrollToEl(target), 60);
    }
  };

  if (firstRender) {
    firstRender = false;
    await swap();
  } else {
    await curtainSwap(view.curtainWord || view.title || "", swap);
  }
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) { location.assign(to); return; }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const same = path === current.path;
  if (replace) history.replaceState({}, "", url.pathname + url.hash);
  else if (!same || url.hash !== location.hash) history.pushState({}, "", url.pathname + url.hash);
  if (same) {
    if (url.hash) {
      const target = document.querySelector(url.hash);
      if (target) scrollToEl(target);
    }
    return;
  }
  renderPath(path, url.hash);
}

export function startRouter(el) {
  viewEl = el;

  // intersep semua link internal (delegasi, termasuk konten dinamis)
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href || /^(https?:)?\/\//.test(href) && new URL(href, location.origin).origin !== location.origin) return;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener("popstate", () => { refreshCurrentRoute(); });

  return renderPath(location.pathname.replace(/\/+$/, "") || "/", location.hash);
}
