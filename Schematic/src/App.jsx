import { AppShell } from "./components/AppShell.jsx";
import { FoundryPage } from "./pages/FoundryPage.jsx";
import { GovernancePage } from "./pages/GovernancePage.jsx";
import { HallsPage, ModulesPage, SocketsPage, WorkbenchPage } from "./pages/ReferencePages.jsx";
import { WorkflowPage } from "./pages/WorkflowPage.jsx";
import { useRouter } from "./router.js";

const pages = {
  "/": FoundryPage,
  "/workflow": WorkflowPage,
  "/halls": HallsPage,
  "/sockets": SocketsPage,
  "/modules": ModulesPage,
  "/workbench": WorkbenchPage,
  "/governance": GovernancePage,
};

export function App() {
  const { path, navigate } = useRouter();
  const Page = pages[path] ?? FoundryPage;

  return (
    <AppShell path={path} navigate={navigate}>
      <Page navigate={navigate} />
    </AppShell>
  );
}
