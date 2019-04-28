const path = require(`path`);
const { createFilePath } = require(`gatsby-source-filesystem`);

function partsOf(file) {
    let dirs = file.relativeDirectory.split("/");

    if (dirs.length > 1) {
        return dirs[1].split("_");
    }

    return file.name.split("_");
}

exports.onCreateNode = ({ node, getNode, actions }) => {
    const { createNodeField } = actions;

    if (node.internal.type === `MarkdownRemark`) {
        const file = getNode(node.parent);

        const [date, name] = partsOf(file);
        const slug = `/posts/${name}/`;

        createNodeField({
            node,
            name: `slug`,
            value: slug,
        });

        createNodeField({
            node,
            name: `published`,
            value: new Date(date),
        });
    }
};

function postsPages(posts, createPage) {
    posts.forEach((post, index) => {
        const previous = index === posts.length - 1 ? null : posts[index + 1];
        const next = index === 0 ? null : posts[index - 1];

        createPage({
            path: post.fields.slug,
            component: path.resolve(`./src/templates/post.js`),
            context: {
                // Data passed to context is available
                // in page queries as GraphQL variables.
                slug: post.fields.slug,
                previous,
                next,
            },
        });
    });
}

exports.createPages = async ({ graphql, actions }) => {
    const { createPage } = actions;

    const {
        data: {
            allMarkdownRemark: { nodes: posts },
        },
    } = await graphql(`
        {
            allMarkdownRemark(sort: { fields: [fields___published], order: DESC }) {
                nodes {
                    fields {
                        slug
                    }
                    frontmatter {
                        title
                        tags
                        draft
                    }
                }
            }
        }
    `);

    postsPages(posts, createPage);
};
