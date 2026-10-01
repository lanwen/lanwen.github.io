import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
    // matches CNAME
    site: "https://lanwen.dev",
    integrations: [react()],
});
