/**
 * Minimal URL routing for the four pages: real URLs (/analyze, /model, /privacy), so the browser's
 * Back/Forward, refresh, bookmarks and shared links all work. State stays in the store; this hook just
 * keeps `page` and `location.pathname` in sync. (Vercel rewrites every path to index.html.)
 */
import { useEffect } from "react";
import { pageFromPath, useStore, type Page } from "../store";

const PATH: Record<Page, string> = { home: "/", analyze: "/analyze", about: "/model", privacy: "/privacy" };
const TITLE: Record<Page, string> = {
  home: "Profiler · Brain tumors, outlined in seconds",
  analyze: "Analyze · Profiler",
  about: "The model · Profiler",
  privacy: "Privacy · Profiler",
};

export function useRouteSync() {
  const page = useStore((s) => s.page);

  // initial URL → page, and Back/Forward → page
  useEffect(() => {
    const apply = () => useStore.setState({ page: pageFromPath(location.pathname) });
    apply();
    addEventListener("popstate", apply);
    return () => removeEventListener("popstate", apply);
  }, []);

  // page → URL + title (push a history entry only when the page actually changes)
  useEffect(() => {
    if (location.pathname !== PATH[page]) history.pushState({}, "", PATH[page]);
    document.title = TITLE[page];
  }, [page]);
}
