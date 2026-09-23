import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ActivityPage } from "./pages/ActivityPage";
import { Dashboard } from "./pages/Dashboard";
import { LandingPage } from "./pages/LandingPage";
import { DemoLoginPage } from "./pages/DemoLoginPage";
import { MissionDetail } from "./pages/MissionDetail";
import { NewMission } from "./pages/NewMission";
import { SettingsPage } from "./pages/SettingsPage";
import { ResourcesPage } from "./pages/ResourcesPage";

function WorkspaceLayout() {
  return <AppShell><div className="animate-page-in"><Outlet /></div></AppShell>;
}

function LegacyMissionRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={`/app/missions/${id}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo-login" element={<DemoLoginPage />} />
      <Route path="/app" element={<WorkspaceLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="missions/new" element={<NewMission />} />
        <Route path="missions/:id" element={<MissionDetail />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/missions/new" element={<Navigate to="/app/missions/new" replace />} />
      <Route path="/missions/:id" element={<LegacyMissionRedirect />} />
      <Route path="/activity" element={<Navigate to="/app/activity" replace />} />
      <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
