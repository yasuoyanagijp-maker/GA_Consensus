import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH || "/";
  const apiBase = process.env.VITE_API_BASE_URL;

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: apiBase
        ? undefined
        : {
            "/api": {
              target: "http://localhost:3847",
              changeOrigin: true,
            },
          },
    },
  };
});
