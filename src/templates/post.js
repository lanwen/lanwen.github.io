import React from "react";
import { graphql, Link } from "gatsby";
import Layout from "../components/layout";
import SEO from "../components/seo";

import styled from "@emotion/styled";
import { rhythm } from "../utils/typography";

const Date = styled.div`
    color: #ccc;
    font-size: ${rhythm(0.5)};
    padding: ${rhythm(0.5)} 0;
`;

const Tags = styled.div`
    display: flex;
    font-size: ${rhythm(0.6)};
    flex-wrap: wrap;
`;

const Tag = styled(Link)`
    margin: ${rhythm(0.5)} ${rhythm(0.5)} 0 0;
`;

const Title = styled.div``;

const Anchor = styled(Link)`
    background-image: none;
    visibility: hidden;
    margin-left: -${rhythm(1)};

    h1:hover & {
        visibility: visible;
    }
`;

export default ({ data: { markdownRemark: post }, pageContext: ctx }) => {
    return (
        <Layout>
            <SEO
                title={post.frontmatter.title}
                description={post.excerpt}
                keywords={post.frontmatter.tags}
            />
            <h1>
                {" "}
                <Date>
                    {post.fields.published} :: {post.timeToRead} min to read
                </Date>
                <Title>
                    <Anchor to={post.fields.slug}>§</Anchor>{" "}
                    {post.frontmatter.title}
                </Title>
            </h1>
            <div dangerouslySetInnerHTML={{ __html: post.html }}/>
            <Tags>
                {post.frontmatter.tags.map(tag => (
                    <Tag to={`/posts/tags/${tag}`} key={tag}>{`#${tag}`}</Tag>
                ))}
            </Tags>
        </Layout>
    );
};

export const query = graphql`
    query($slug: String!) {
        markdownRemark(fields: { slug: { eq: $slug } }) {
            html
            excerpt
            timeToRead
            frontmatter {
                title
                tags
            }
            fields {
                slug
                published(formatString: "YYYY-MM-DD")
            }
        }
    }
`;
