import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { satteri } from "@astrojs/markdown-satteri";

import {
    autolinkHeaders,
    fencedCode,
    highlightWrapper,
    inlineCode,
    looseLists,
} from "./src/utils/markdown-plugins.js";

export default defineConfig({
    site: "https://lanwen.dev",
    integrations: [react()],
    markdown: {
        syntaxHighlight: "prism",
        processor: satteri({
            mdastPlugins: [fencedCode, looseLists],
            hastPlugins: [inlineCode, highlightWrapper, autolinkHeaders],
            features: { smartPunctuation: false },
        }),
    },
});
