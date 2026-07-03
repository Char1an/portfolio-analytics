import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import Forecast from './pages/Forecast';
import Simulation from './pages/Simulation';
import Optimizer from './pages/Optimizer';
import GoalPlanner from './pages/GoalPlanner';
import Tax from './pages/Tax';
import FundBrowser from './pages/FundBrowser';
import RegimeAnalysis from './pages/RegimeAnalysis';
import Overlap from './pages/Overlap';
import FactorAttribution from './pages/FactorAttribution';
import Agent from './pages/Agent';
import SWP from './pages/SWP';
import FundCompare from './pages/FundCompare';
import RebalanceSimulator from './pages/RebalanceSimulator';
import TimeMachine from './pages/TimeMachine';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Full-screen auth page — no sidebar */}
          <Route path="/login" element={<Login />} />

          {/* App shell with sidebar */}
          <Route element={<Layout />}>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/portfolio"     element={<Portfolio />} />
            <Route path="/funds"         element={<FundBrowser />} />
            <Route path="/analytics"     element={<Analytics />} />
            <Route path="/forecast"      element={<Forecast />} />
            <Route path="/simulation"    element={<Simulation />} />
            <Route path="/optimizer"     element={<Optimizer />} />
            <Route path="/goal"          element={<GoalPlanner />} />
            <Route path="/tax"           element={<Tax />} />
            <Route path="/swp"           element={<SWP />} />
            <Route path="/compare"       element={<FundCompare />} />
            <Route path="/rebalance"     element={<RebalanceSimulator />} />
            <Route path="/time-machine"  element={<TimeMachine />} />
            <Route path="/regime"            element={<RegimeAnalysis />} />
            <Route path="/overlap"           element={<Overlap />} />
            <Route path="/factor-attribution" element={<FactorAttribution />} />
            <Route path="/agent"             element={<Agent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
