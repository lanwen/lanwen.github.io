import React from "react"
import { graphql, Link } from "gatsby"

import Layout from "../components/layout"
import SEO from "../components/seo"

const CategoryTemplate = ({ pageContext, data }) => {
    const { tag } = pageContext;
    return (
        <Layout>
            <SEO title={`Posts in tag "${tag}"`}/>
            <div>
                <h1>Tag: #{tag}</h1>
                {data.markdown.posts.map(post => (
                    <div key={post.fields.slug}><Link to={post.fields.slug}>{post.frontmatter.title}</Link> {post.fields.published}</div>
                ))}
            </div>
        </Layout>
    )
};

export const query = graphql`
  query TagPage($tag: String) {
    markdown:allMarkdownRemark(
      limit: 1000
      filter: { 
        frontmatter: {draft: {ne: true}}
        fields: { tags: { in: [$tag] } } 
      }
    ) {
      totalCount
        posts:nodes {
          fields {
            slug
            tags
            published(formatString: "YYYY-MM-DD")
          }
          excerpt
          timeToRead
          frontmatter {
            title
          }
      }
    }
  }
`;

export default CategoryTemplate