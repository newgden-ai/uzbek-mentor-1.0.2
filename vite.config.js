import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "/uzbek-mentor-app/" — поменяй на имя своего репозитория при деплое на GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: "./",
});
