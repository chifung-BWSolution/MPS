import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import TempoHost from "../.tempo/tempo-host";

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
const isTempoHostRoute = window.location.pathname.startsWith("/tempo-host");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isTempoHostRoute ? (
      <TempoHost />
    ) : (
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
