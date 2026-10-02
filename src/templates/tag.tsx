import Layout from "../components/layout"
import type { Post } from "../utils/posts"

const CategoryTemplate = ({ tag, posts }: { tag: string; posts: Post[] }) => {
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
