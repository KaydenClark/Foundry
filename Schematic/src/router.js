import { useEffect, useState } from "react";

export const routes = [
  { path: "/", label: "Factory", longLabel: "Factory Overview" },
  { path: "/workflows", label: "Workflows", longLabel: "Workflow Library" },
  { path: "/run", label: "Run Player", longLabel: "Run Player" },
  { path: "/governance", label: "Governance", longLabel: "Governance Stack" },
  { path: "/halls", label: "Halls & Parts", longLabel: "Halls & Parts" },
  { path: "/history", label: "History", longLabel: "Run History / Trace" },
];

function normalizePath(pathname) {
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return routes.some((route) => route.path === withoutTrailing) ? withoutTrailing : "/";
}

export function useRouter() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextPath) => {
    const normalized = normalizePath(nextPath);
    if (normalized === path) return;
    window.history.pushState({}, "", normalized);
    setPath(normalized);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return { path, navigate };
}
