import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { NavBar } from "@/components/UI/NavBar";
import { BattlePage } from "@/pages/BattlePage";
import { UpgradePage } from "@/pages/UpgradePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { ConfigPage } from "@/pages/ConfigPage";
import { useShipStore } from "./store/useShipStore";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const loadSavedData = useShipStore(state => state.loadSavedData);
  const loadDeceptionState = useGameStore(state => state.loadDeceptionState);
  const loadHistory = useGameStore(state => state.loadHistory);

  useEffect(() => {
    loadSavedData();
    loadDeceptionState();
    loadHistory();
  }, [loadSavedData, loadDeceptionState, loadHistory]);

  return (
    <Router>
      <div className="min-h-screen bg-space-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <NavBar />
          <Routes>
            <Route path="/" element={<BattlePage />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
