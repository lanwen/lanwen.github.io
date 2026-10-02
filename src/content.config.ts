import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
    loader: glob({
        pattern: "**/*.md",
        base: "./content/posts",
        generateId: ({ entry }) => entry.replace(/\.md$/, ""),
    }),
    schema: z.object({
        title: z.string(),
        tags: z.array(z.string()),
        draft: z.boolean().optional(),
    }),
});

export const collections = { posts };
