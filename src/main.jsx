import React from "react";
import ReactDOM from "react-dom/client";
import App from "./career-sonar.jsx";
import "./index.css";

/* ------------------------------------------------------------------ *
 *  window.storage shim
 *  ------------------------------------------------------------------
 *  The Claude.ai artifact provided a `window.storage` API. Here we
 *  recreate the SAME async API (get / set / delete / list) backed by
 *  the browser's localStorage — so our existing career-sonar.jsx code
 *  runs completely UNCHANGED.
 *
 *  Data lives in this browser only (per device). In a later step this
 *  same shim can be pointed at a real database with no app changes.
 * ------------------------------------------------------------------ */
if (typeof window !== "undefined" && !window.storage) {
  const NS = "cs::"; // namespace so we don't collide with anything else
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(NS + key);
      return v === null ? null : { key, value: v, shared: false };
    },
    async set(key, value) {
      const v = String(value);
      localStorage.setItem(NS + key, v);
      return { key, value: v, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(NS + key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS + prefix)) keys.push(k.slice(NS.length));
      }
      return { keys, prefix, shared: false };
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
