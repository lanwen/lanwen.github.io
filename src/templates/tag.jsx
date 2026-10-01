import React from "react"

import Layout from "../components/layout"

const CategoryTemplate = ({ tag, posts }) => {
    return (
        <Layout>
            <div>
                <h1>Tag: #{tag}</h1>
                {posts.map(post => (
                    <div key={post.fields.slug}><a href={post.fields.slug}>{post.frontmatter.title}</a> {post.fields.published}</div>
                ))}
            </div>
        </Layout>
    )
};

export default CategoryTemplate
