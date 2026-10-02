import Layout from "../components/layout";
import type { Post } from "../utils/posts";

import styles from "./post.module.css";

export default ({ post }: { post: Post }) => {
    return (
        <Layout>
            <h1>
                {" "}
                <div className={styles.date}>
                    {post.fields.published} :: {post.timeToRead} min to read
                </div>
                <div className={styles.title}>
                    <a className={styles.anchor} href={post.fields.slug}>§</a>{" "}
                    {post.frontmatter.title}
                </div>
            </h1>
            <div dangerouslySetInnerHTML={{ __html: post.html }}/>
            <div className={styles.tags}>
                {post.frontmatter.tags.map(tag => (
                    <a className={styles.tag} href={`/posts/tags/${tag}`} key={tag}>{`#${tag}`}</a>
                ))}
            </div>
        </Layout>
    );
};
