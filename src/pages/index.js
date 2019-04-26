import React from "react";

import Layout from "../components/layout";
import SEO from "../components/seo";

import { graphql, Link } from "gatsby";

import { rhythm } from "../utils/typography";
import styled from "@emotion/styled";

const Post = styled.div`
    display: flex;
`;

const Title = styled.div`
    padding-right: ${rhythm(1.5)};
`;

const Date = styled.div``;

const IndexPage = ({ data }) => {
    return (
        <Layout>
            <SEO
                title="Merkushev Kirill's Blog - All posts"
                keywords={[`lanwen`, `java`, `javascript`, `golang`]}
            />

            {data.markdown.posts.map((post, index) => (
                <Post key={index}>
                    <Title>
                        <Link to={post.fields.slug}>
                            {" "}
                            {post.frontmatter.title}
                        </Link>
                    </Title>
                    <Date>{post.fields.published} ({post.timeToRead} min to read)</Date>
                </Post>
            ))}
        </Layout>
    );
};

export const query = graphql`
    query {
        markdown: allMarkdownRemark(
            sort: { fields: [fields___published], order: DESC }
        ) {
            total: totalCount
            posts: nodes {
                frontmatter {
                    title
                    tags
                }
                fields {
                    slug
                    published(formatString: "YYYY-MM-DD")
                }
                timeToRead
            }
        }
    }
`;

export default IndexPage;
