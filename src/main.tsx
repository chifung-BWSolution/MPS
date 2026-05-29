import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { redirectFromLegacyHost } from "./lib/siteUrl";

// If the tab landed on the legacy mps-lilac.vercel.app preview domain,
// bounce it to the canonical https://bwteam-marketing.com before React mounts
// so the user never sees a flash of the old host.
redirectFromLegacyHost();

// Suppress unhandled promise rejections from third-party scripts (e.g. Supabase auth, analytics)
window.addEventListener('unhandledrejection', (event) => {
  // Prevent these from showing as "Script error" in the console
  if (event.reason?.message?.includes?.('Failed to fetch') ||
      event.reason?.message?.includes?.('NetworkError') ||
      event.reason?.message?.includes?.('Load failed')) {
    console.warn('[Suppressed] Unhandled network rejection:', event.reason?.message);
    event.preventDefault();
  }
});

const basename = import.meta.env.BASE_URL;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
