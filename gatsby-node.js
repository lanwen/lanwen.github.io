const path = require(`path`);
const {createFilePath} = require(`gatsby-source-filesystem`)

exports.onCreateNode = ({node, getNode, actions}) => {
  const {createNodeField} = actions;

  if (node.internal.type === `MarkdownRemark`) {

    const file = getNode(node.parent);

    const [date, name] = file.name.split("_");
    const slug = `/${file.relativeDirectory}/${name}/`;

    createNodeField({
      node,
      name: `slug`,
      value: slug,
    });

    createNodeField({
      node,
      name: `published`,
      value: new Date(date),
    })
  }
};

exports.createPages = async ({graphql, actions}) => {
  const {createPage} = actions;

  const {
    data: {
      allMarkdownRemark: {
        nodes: posts
      }
    }
  } = await graphql(`
    {
      allMarkdownRemark {
        nodes {
          fields {
            slug
          }
        }
      }
    }
  `);

  posts.forEach(post => {
    createPage({
      path: post.fields.slug,
      component: path.resolve(`./src/templates/post.js`),
      context: {
        // Data passed to context is available
        // in page queries as GraphQL variables.
        slug: post.fields.slug,
      },
    })
  })
};