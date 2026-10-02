import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";
import slugify from "slug";
import words from "lodash/words.js";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

export const formatDay = (date) => date.toISOString().slice(0, 10);
export const formatMonth = (date) =>
    `${date.getUTCFullYear()} ${MONTHS[date.getUTCMonth()]}`;

export function partsOf(id) {
    const [dir, file] = id.split("/");
    return (file ? dir : id).split("_");
}

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

const newestFirst = (a, b) =>
    b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : 1);

export const inFileOrder = (a, b) =>
    a.id.includes("/") - b.id.includes("/") || (a.id < b.id ? -1 : 1);

export async function getAllPosts() {
    return (await getCollection("posts")).map(toPost).sort(newestFirst);
}

export async function getPublishedPosts() {
    return (await getAllPosts()).filter((post) => !post.frontmatter.draft);
}
