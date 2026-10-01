import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Both layouts are picked up:
//   content/posts/2024-06-26_slug.md
//   content/posts/2019-04-10_slug/index.md
// The id is the path without the extension, so the helpers in
// src/utils/posts.js can derive slug and date from the file name the same way
// gatsby-node.js did.
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
