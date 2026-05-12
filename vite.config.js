import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rawBase = (process.env.VITE_BASE_PATH ?? "/").trim() || "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
});
