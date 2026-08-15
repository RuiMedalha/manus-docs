import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import BankImportPage from "./pages/BankImport";
import InboxPage from "./pages/Inbox";
import PlaceholderPage from "./pages/PlaceholderPage";
import RulesPage from "./pages/Rules";
import ReconciliationPage from "./pages/Reconciliation";
import SettingsPage from "./pages/Settings";
import IntegrationsPage from "./pages/Integrations";
import OrganizationPage from "./pages/Organization";
import AuditPage from "./pages/Audit";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <DashboardLayout>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/inbox"} component={InboxPage} />
        <Route path={"/extratos"} component={BankImportPage} />
        <Route path={"/conciliacao"} component={ReconciliationPage} />
        <Route path={"/regras"} component={RulesPage} />
        <Route path={"/integracoes"} component={IntegrationsPage} />
        <Route path={"/organizacao"} component={OrganizationPage} />
        <Route path={"/auditoria"} component={AuditPage} />
        <Route path={"/definicoes"} component={SettingsPage} />
      </DashboardLayout>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
