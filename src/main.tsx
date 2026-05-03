import "@heroui/styles";
import { ToastProvider } from "@heroui/react";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

if ("serviceWorker" in navigator) {
  if (isLocalDevelopmentHost()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (registration.scope === `${window.location.origin}/`) {
            void registration.unregister();
          }
        }
      });
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
}

createRoot(root).render(
  <React.StrictMode>
    <App />
    <ToastProvider placement="top" />
  </React.StrictMode>,
);
