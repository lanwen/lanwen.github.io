import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";
import slugify from "slug";
import words from "lodash/words.js";

// Everything gatsby-node.js, gatsby-plugin-tags and gatsby-transformer-remark
// used to compute for a post, in the shape the templates already read:
// { html, excerpt, timeToRead, frontmatter, fields: { slug, published, month, tags } }

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

// The two formats the old GraphQL queries asked for.
export const formatDay = (date) => date.toISOString().slice(0, 10); // YYYY-MM-DD
export const formatMonth = (date) =>
    `${date.getUTCFullYear()} ${MONTHS[date.getUTCMonth()]}`; // YYYY MMM

// content/posts/2024-06-26_slug.md          -> ["2024-06-26", "slug"]
// content/posts/2019-04-10_slug/index.md    -> ["2019-04-10", "slug"]
// The id has no extension: "2024-06-26_slug" or "2019-04-10_slug/index".
export function partsOf(id) {
    const [dir, file] = id.split("/");
    return (file ? dir : id).split("_");
}

// gatsby-plugin-tags: slug(tag, { lower: true })
export const tagSlug = (tag) => slugify(tag, { lower: true });

const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
};
const decode = (text) =>
    text.replace(
        /&(?:#x([0-9a-f]+)|#(\d+)|(\w+));/gi,
        (match, hex, dec, name) =>
            hex
                ? String.fromCodePoint(parseInt(hex, 16))
                : dec
                ? String.fromCodePoint(Number(dec))
                : ENTITIES[name] ?? match
    );

// gatsby-transformer-remark: round(words / 265), at least 1. It counted the
// words of the HTML after sanitize-html, and its `allowTags: []` option is a
// typo of `allowedTags`: the sanitizer ran with its (v1) defaults, which keep
// tags like <p> and the href of links. Those tag names and URLs were counted
// as words too, and the numbers shown on the pages depend on that.
const COUNTED_HTML = {
    allowedTags:
        "h3 h4 h5 h6 blockquote p a ul ol nl li b i strong em strike abbr code hr br div table thead caption tbody tr th td pre iframe".split(
            " "
        ),
    allowedAttributes: { a: ["href", "name", "target"], img: ["src"] },
};

function timeToRead(html) {
    const wordCount = words(sanitizeHtml(html, COUNTED_HTML)).length;
    return Math.max(1, Math.round(wordCount / 265));
}

// underscore.string's prune, which gatsby-transformer-remark used for the
// excerpt: cuts at `length` without leaving a half-chopped word.
function prune(str, length, pruneStr) {
    if (str.length <= length) return str;

    let template = str
        .slice(0, length + 1)
        .replace(/.(?=\W*\w*$)/g, (c) =>
            c.toUpperCase() !== c.toLowerCase() ? "A" : " "
        );

    if (template.slice(template.length - 2).match(/\w\w/)) {
        template = template.replace(/\s*\S+$/, "");
    } else {
        template = template.slice(0, template.length - 1).replace(/\s+$/, "");
    }

    return (template + pruneStr).length > str.length
        ? str
        : str.slice(0, template.length) + pruneStr;
}

// Plain text of the post, without code (inline and blocks), up to 140
// characters, ending with an ellipsis. The old remark kept spaces at the end
// of a line and this Markdown parser drops them, so a few excerpts differ in
// whitespace, and now and then end one word earlier or later.
function excerpt(html) {
    const text = html
        .replace(/<pre[\s\S]*?<\/pre>/g, "")
        .replace(/<code[^>]*>[\s\S]*?<\/code>/g, "")
        .replace(/>\s+</g, "><")
        .replace(/<(?:p|h[1-6]|li|td|th|br)[\s>/]/g, " $&")
        .replace(/<[^>]*>/g, "");

    return prune(decode(text).trim(), 140, "…");
}

function toPost(entry) {
    const [date, name] = partsOf(entry.id);
    const published = new Date(date);
    const html = entry.rendered?.html ?? "";

    return {
        html,
        excerpt: excerpt(html),
        timeToRead: timeToRead(html),
        frontmatter: entry.data,
        fields: {
            slug: `/posts/${name}/`,
            published: formatDay(published),
            month: formatMonth(published),
            tags: entry.data.tags.map(tagSlug),
        },
        name,
        id: entry.id,
        publishedAt: published,
    };
}

// Newest first. Posts of the same day are ordered by file name.
const newestFirst = (a, b) =>
    b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : 1);

// gatsby-plugin-tags' page query had no sort, so the tag pages listed posts in
// the order the files were found: the flat files by name (that is oldest
// first), then the posts that live in a directory.
export const inFileOrder = (a, b) =>
    a.id.includes("/") - b.id.includes("/") || (a.id < b.id ? -1 : 1);

// Every post, drafts included: drafts still get a page.
export async function getAllPosts() {
    return (await getCollection("posts")).map(toPost).sort(newestFirst);
}

// What the index and the tag pages list.
export async function getPublishedPosts() {
    return (await getAllPosts()).filter((post) => !post.frontmatter.draft);
}
