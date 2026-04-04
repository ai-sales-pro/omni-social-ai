import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import { initGlowEffect } from "./effects/glow-effect";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Leads from "./pages/Leads";
import Payments from "./pages/Payments";
import Admin from "./pages/Admin";
import Customers from "./pages/Customers";
import Channels from "./pages/Channels";
import AISettings from "./pages/AISettings";
import Bank from "./pages/Bank";
import Analytics from "./pages/Analytics";

const PAGE_COMPONENTS = {
  Landing,
  Login,
  Register,
  Dashboard,
  Inbox,
  Leads,
  Payments,
  Admin,
  Customers,
  Channels,
  "AI Settings": AISettings,
  Bank,
  Analytics
};

const PAGE_BACKGROUNDS = {
  Dashboard: "/assets/images/dashboard-hero.JPEG",
  Inbox: "/assets/images/inbox-hero.JPEG",
  Leads: "/assets/images/leads-hero.JPEG",
  Payments: "/assets/images/payments-hero.JPEG",
  Admin: "/assets/images/admin-hero.JPEG",
  Customers: "/assets/images/customers-hero.JPEG",
  Channels: "/assets/images/channels-hero.JPEG",
  "AI Settings": "/assets/images/ai-settings-hero.JPEG",
  Bank: "/assets/images/bank-hero.JPEG",
  Analytics: "/assets/images/analytics-hero.JPEG"
};

const PAGE_GLOWS = {
  Dashboard:
    "radial-gradient(circle at 72% 18%, rgba(160,110,255,0.30), transparent 28%), radial-gradient(circle at 20% 84%, rgba(90,40,180,0.22), transparent 30%)",
  Inbox:
    "radial-gradient(circle at 75% 18%, rgba(80,210,255,0.22), transparent 28%), radial-gradient(circle at 16% 80%, rgba(120,80,255,0.18), transparent 32%)",
  Leads:
    "radial-gradient(circle at 74% 18%, rgba(255,120,220,0.20), transparent 28%), radial-gradient(circle at 18% 82%, rgba(150,80,255,0.18), transparent 30%)",
  Payments:
    "radial-gradient(circle at 75% 18%, rgba(90,255,180,0.18), transparent 28%), radial-gradient(circle at 20% 82%, rgba(120,80,255,0.18), transparent 30%)",
  Admin:
    "radial-gradient(circle at 78% 18%, rgba(164,108,255,0.34), transparent 28%), radial-gradient(circle at 24% 84%, rgba(103,43,214,0.24), transparent 30%)",
  Customers:
    "radial-gradient(circle at 76% 18%, rgba(255,185,90,0.18), transparent 28%), radial-gradient(circle at 18% 82%, rgba(140,80,255,0.18), transparent 30%)",
  Channels:
    "radial-gradient(circle at 76% 18%, rgba(90,160,255,0.20), transparent 28%), radial-gradient(circle at 20% 84%, rgba(120,80,255,0.20), transparent 30%)",
  "AI Settings":
    "radial-gradient(circle at 76% 18%, rgba(90,255,255,0.18), transparent 28%), radial-gradient(circle at 20% 84%, rgba(120,80,255,0.20), transparent 30%)",
  Bank:
    "radial-gradient(circle at 74% 18%, rgba(100,180,255,0.18), transparent 28%), radial-gradient(circle at 20% 84%, rgba(140,80,255,0.18), transparent 30%)",
  Analytics:
    "radial-gradient(circle at 76% 18%, rgba(210,120,255,0.18), transparent 28%), radial-gradient(circle at 20% 84%, rgba(110,70,255,0.20), transparent 30%)"
};

function getInitialMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") || "landing";
}

function getInitialPage() {
  const params = new URLSearchParams(window.location.search);
  const pageFromUrl = params.get("page");

  if (PAGE_COMPONENTS[pageFromUrl]) {
    return pageFromUrl;
  }

  const mode = params.get("mode");
  if (mode === "app") return "Dashboard";

  return "Landing";
}

function App() {
  const [mode, setMode] = useState(getInitialMode);
  const [page, setPage] = useState(getInitialPage);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const cleanup = initGlowEffect();
    return () => cleanup && cleanup();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    params.set("mode", mode);
    params.set("page", page);

    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }, [mode, page]);

  useEffect(() => {
    if (mode !== "app") return;

    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), 260);
    return () => clearTimeout(timer);
  }, [page, mode]);

  const CurrentPage = useMemo(() => {
    return PAGE_COMPONENTS[page] || Landing;
  }, [page]);

  const currentBg = PAGE_BACKGROUNDS[page] || PAGE_BACKGROUNDS.Dashboard;
  const currentGlow = PAGE_GLOWS[page] || PAGE_GLOWS.Dashboard;

  function enterApp(targetPage = "Dashboard") {
    setMode("app");
    setPage(targetPage);
  }

  function goLogin() {
    setMode("landing");
    setPage("Login");
  }

  function goRegister() {
    setMode("landing");
    setPage("Register");
  }

  if (mode === "landing") {
    if (page === "Login") {
      return (
        <Login
          onLoggedIn={() => {
            enterApp("Dashboard");
          }}
        />
      );
    }

    if (page === "Register") {
      return (
        <Register
          onRegistered={() => {
            enterApp("Dashboard");
          }}
        />
      );
    }

    return (
      <Landing
        onLogin={goLogin}
        onEnterApp={() => enterApp("Dashboard")}
      />
    );
  }

  return (
    <div style={styles.appShell}>
      <div id="mouse-glow" style={styles.mouseGlow} />

      <div
        style={{
          ...styles.bgImage,
          backgroundImage: `url(${currentBg})`
        }}
      />

      <div style={styles.bgDarkMask} />

      <div
        style={{
          ...styles.bgGlowLayer,
          backgroundImage: currentGlow
        }}
      />

      <div style={styles.starsLayer} />
      <div style={styles.vignetteLayer} />

      <Sidebar page={page} setPage={setPage} />

      <main style={styles.mainArea}>
        <div
          style={{
            ...styles.commandCenter,
            ...(transitioning ? styles.commandCenterTransition : {})
          }}
        >
          <div style={styles.topAmbientLine} />
          <CurrentPage />
        </div>
      </main>
    </div>
  );
}

const styles = {
  appShell: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    background:
      "radial-gradient(circle at top, rgba(34,18,58,1) 0%, rgba(10,7,22,1) 48%, rgba(5,3,12,1) 100%)",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#fff"
  },

  mouseGlow: {
    position: "fixed",
    left: 0,
    top: 0,
    width: "280px",
    height: "280px",
    borderRadius: "999px",
    pointerEvents: "none",
    zIndex: 1,
    opacity: 0.42,
    filter: "blur(55px)",
    transform: "translate(-50%, -50%)",
    background:
      "radial-gradient(circle, rgba(168, 85, 247, 0.30) 0%, rgba(99, 102, 241, 0.18) 35%, rgba(0, 0, 0, 0) 72%)"
  },

  bgImage: {
    position: "fixed",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    opacity: 0.24,
    transform: "scale(1.03)",
    filter: "blur(1.5px) saturate(1.04) brightness(0.78)",
    transition: "background-image 0.35s ease, opacity 0.35s ease",
    zIndex: 0
  },

  bgDarkMask: {
    position: "fixed",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(8,6,18,0.48), rgba(8,6,18,0.66) 38%, rgba(7,5,16,0.90) 100%)",
    zIndex: 1,
    pointerEvents: "none"
  },

  bgGlowLayer: {
    position: "fixed",
    inset: 0,
    backgroundRepeat: "no-repeat",
    filter: "blur(8px)",
    opacity: 1,
    zIndex: 2,
    pointerEvents: "none",
    transition: "background-image 0.4s ease"
  },

  starsLayer: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1.2px)",
    backgroundSize: "42px 42px",
    opacity: 0.1,
    zIndex: 2,
    pointerEvents: "none"
  },

  vignetteLayer: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(circle at center, transparent 38%, rgba(0,0,0,0.18) 70%, rgba(0,0,0,0.34) 100%)",
    zIndex: 2,
    pointerEvents: "none"
  },

  mainArea: {
    position: "relative",
    zIndex: 3,
    marginLeft: "260px",
    padding: "22px 22px 22px 16px",
    transition: "margin-left 0.3s ease"
  },

  commandCenter: {
    minHeight: "calc(100vh - 44px)",
    position: "relative",
    borderRadius: "30px",
    padding: "26px",
    background:
      "linear-gradient(180deg, rgba(22,14,44,0.58), rgba(16,10,35,0.72))",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow:
      "0 24px 90px rgba(0,0,0,0.34), 0 0 42px rgba(143,94,255,0.10), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 22px rgba(173,123,255,0.03)",
    overflow: "hidden",
    transition:
      "opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease"
  },

  commandCenterTransition: {
    opacity: 0.82,
    transform: "translateY(8px)"
  },

  topAmbientLine: {
    position: "absolute",
    top: 0,
    left: "8%",
    width: "54%",
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(205,177,255,0.42), rgba(140,90,255,0.18), transparent)",
    boxShadow: "0 0 18px rgba(176,138,255,0.26)"
  }
};

export default App;