import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

import Dashboard from "./pages/Dashboard";
import ScanPage from "./pages/ScanPage";
import ScanResult from "./pages/ScanResult";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import BrandRatings from "./pages/BrandRatings";
import HealthProfile from "./pages/HealthProfile";
import Settings from "./pages/Settings";


function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Application Routes */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/scan/:scanId" element={<ScanResult />} />
          <Route path="/history" element={<History />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/brands" element={<BrandRatings />} />
          <Route path="/profile" element={<HealthProfile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;