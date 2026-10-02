import GithubSlugger from "github-slugger";
import { defineHastPlugin, defineMdastPlugin } from "satteri";

export const fencedCode = defineMdastPlugin({
    name: "fenced-code",
    code(node, ctx) {
        ctx.setProperty(
            node,
            "value",
            node.value.replace(/^(?:[ \t]*\n)+/, "")
        );

        if (node.lang && node.meta) {
            ctx.setProperty(
                node,
                "lang",
                node.lang + node.meta.replace(/\s+/g, "")
            );
            ctx.setProperty(node, "meta", null);
        }
    },
});

export const looseLists = defineMdastPlugin({
    name: "loose-lists",
    options: { position: true },
    list(node, ctx) {
        if (node.children.some((item) => item.children.length > 1)) {
            ctx.setProperty(node, "spread", true);
            node.children.forEach((item) =>
                ctx.setProperty(item, "spread", true)
            );
        }
    },
    code(node, ctx) {
        const parent = ctx.parent(node);
        if (parent.type !== "listItem" || parent.children.length < 2) return;

        const indent = " ".repeat(node.position.start.column - 1);
        const value = node.value
            .split("\n")
            .map((line) =>
                line.startsWith(indent) ? line.slice(indent.length) : line
            )
            .join("\n");
        ctx.setProperty(node, "value", value);
    },
});

export const inlineCode = defineHastPlugin({
    name: "inline-code",
    element: {
        filter: ["code"],
        visit(node, ctx) {
            if (ctx.parent(node).tagName !== "pre") {
                ctx.setProperty(node, "className", ["language-text"]);
            }
        },
    },
});

export const highlightWrapper = defineHastPlugin({
    name: "highlight-wrapper",
    element: {
        filter: ["pre"],
        visit(node, ctx) {
            const language =
                node.properties?.["data-language"] ??
                node.properties?.dataLanguage;
            if (typeof language !== "string") return;

            ctx.setProperty(node, "dataLanguage", null);
            ctx.setProperty(node, "data-language", null);
            ctx.wrapNode(node, {
                raw: `<div class="gatsby-highlight" data-language="${language}"></div>`,
            });
        },
    },
});

const linkIcon =
    '<svg aria-hidden="true" focusable="false" height="16" version="1.1" viewBox="0 0 16 16" width="16">' +
    '<path fill-rule="evenodd" d="M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"></path>' +
    "</svg>";

export const autolinkHeaders = () => {
    const slugger = new GithubSlugger();

    return defineHastPlugin({
        name: "autolink-headers",
        element: {
            filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
            visit(node, ctx) {
                const id = slugger.slug(ctx.textContent(node));
                const label = id.split("-").join(" ");

                ctx.setProperty(node, "id", id);
                ctx.setProperty(node, "style", "position:relative;");
                ctx.prependChild(node, {
                    type: "raw",
                    value: `<a href="#${encodeURI(
                        id
                    )}" aria-label="${label} permalink" class="anchor before">${linkIcon}</a>`,
                });
            },
        },
    });
};
