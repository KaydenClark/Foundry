import { useEffect, useState } from "react";

export const routes = [
  { path: "/", label: "The Foundry", longLabel: "The Foundry" },
  { path: "/workflow", label: "Workflow", longLabel: "Job Order Workflow" },
  { path: "/halls", label: "Halls", longLabel: "Foundry Halls" },
  { path: "/sockets", label: "Sockets", longLabel: "Socket Contracts" },
  { path: "/modules", label: "Modules", longLabel: "Foundry Modules" },
  { path: "/workbench", label: "Workbench", longLabel: "Workbench Anatomy" },
  { path: "/governance", label: "Governance", longLabel: "Governance Floors" },
];

const legacyRoutes = new Map([
  ["/workflows", "/workflow"],
  ["/run", "/workflow"],
  ["/history", "/workflow"],
]);

export function normalizePath(pathname) {
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const resolved = legacyRoutes.get(withoutTrailing) ?? withoutTrailing;
  return routes.some((route) => route.path === resolved) ? resolved : "/";
}

export function useRouter() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const replaceLegacyLocation = () => {
      const normalized = normalizePath(window.location.pathname);
      if (normalized !== window.location.pathname) window.history.replaceState({}, "", normalized);
      setPath(normalized);
    };
    replaceLegacyLocation();
    const handlePopState = () => replaceLegacyLocation();
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
