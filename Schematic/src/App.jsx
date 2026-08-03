import { AppShell } from "./components/AppShell.jsx";
import { FactoryOverview } from "./pages/FactoryOverview.jsx";
import { GovernancePage } from "./pages/GovernancePage.jsx";
import { HallsPage } from "./pages/HallsPage.jsx";
import { HistoryPage } from "./pages/HistoryPage.jsx";
import { RunPlayer } from "./pages/RunPlayer.jsx";
import { WorkflowsPage } from "./pages/WorkflowsPage.jsx";
import { useRouter } from "./router.js";

const pages = {
  "/": FactoryOverview,
  "/workflows": WorkflowsPage,
  "/run": RunPlayer,
  "/governance": GovernancePage,
  "/halls": HallsPage,
  "/history": HistoryPage,
};

export function App() {
  const { path, navigate } = useRouter();
  const Page = pages[path] ?? FactoryOverview;

  return (
    <AppShell path={path} navigate={navigate}>
      <Page navigate={navigate} />
    </AppShell>
  );
}
