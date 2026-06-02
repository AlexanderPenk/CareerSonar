import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal Vite setup — runs our existing React code as a real, deployable app.
export default defineConfig({
  plugins: [react()],
});
