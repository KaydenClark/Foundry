import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const meshServer = {
  host: "0.0.0.0",
  port: 5173,
  strictPort: true,
  allowedHosts: ["Servitor.local", "foundry.example"],
};

export default defineConfig({
  plugins: [react()],
  server: meshServer,
  preview: meshServer,
  build: {
    target: "es2022",
  },
});
