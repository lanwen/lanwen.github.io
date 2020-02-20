import React from "react";
import SEO from "../components/seo";

import { graphql, Link } from "gatsby";

import { rhythm } from "../utils/typography";

import { css, Global } from "@emotion/core";
import styled from "@emotion/styled";

import twitter from "../images/twitter.svg";
import gh from "../images/github.svg";

const Post = styled.div`
    display: flex;
`;

const PostTitle = styled.div`
    padding-right: ${rhythm(1.5)};
    flex: 1;
`;

const PostDetails = styled.div`
padding-right: 30px;
color: #666;
`;

const IndexLayout = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
`;

const Top = styled.div`
  flex: 1 0 33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
`;


const Item = styled.a`
  font-size: ${props => rhythm(props.x || 1)};
  line-height: ${props => rhythm(props.x || 1)};
  text-transform: uppercase;
  margin-right: ${props => rhythm(props.offset || 0)};
  background-image: none;
  color: #2d2d2d;
  
  &:hover {
    color: #134896;
  }
`;

const BlankItem = styled(Item)`
    &:hover {
        color: #2d2d2d;
    }
`;

const Bottom = styled.div`
  flex: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Timeline = styled.div`
  display: flex;
  align-items: flex-start;
  flex: 1;
  flex-direction: column;
  width: 100%;
`;

const Period = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  
  
  &:last-child {
    flex: 1;
  }
  
  @media(min-width: 750px) {
    flex-direction: row;
  }
`;

const PeriodTitle = styled.div`
  height: 100%;
  display: flex;
  padding-left: 10px;
  padding-top: 10px;
  border-left: 1px solid #2d2d2d;
  justify-content: flex-start;
  color: #666;
  flex: 0;
  
  @media(min-width: 750px) {
    border-left: none;
    justify-content: flex-end;
    padding-right: 10px;
    flex: 1 0 50%;
  }
`;

const PeriodContent = styled.div`
  flex: 1 0 50%;
  flex-direction: column;
  border-left: 1px solid #2d2d2d;
  padding-left: 10px;
  padding-top: 10px;
`;

const Social = styled.img`
    width: ${rhythm(0.8)};
    height: ${rhythm(0.8)};
    margin: 0 0 3px;
`;

const IndexPage = ({ data }) => {
    const byMonth = data.markdown.posts.reduce((monthly, post) => {
        const month = post.fields.month;
        const posts = [...monthly[month] || [], post];

        return ({
            ...monthly,
            [month]: posts
        })
    }, {});

    return (
        <IndexLayout>
            <Global
                styles={css`
                    html,
                    body,
                    #___gatsby,
                    #___gatsby > div {
                        height: 100%;
                    }
                    
                    .anchor {
                      background-image: none;
                    }
                `}
            />
            <SEO
                title="Merkushev Kirill's Blog - All posts"
                keywords={[`lanwen`, `java`, `javascript`, `golang`]}
            />

            <Top>
                <h4>Merkushev Kirill's</h4>
                <Item x={1.1} offset={3} href={"https://twitter.com/delnariel"} target={"_blank"}>Twitter <Social src={twitter} alt={"Twitter"} /></Item>
                <Item x={1.3} offset={-1} href={"https://github.com/lanwen"} target={"_blank"}><Social src={gh} alt={"Github"} /> Code</Item>
                {/*<Item x={1.8} offset={4} href={"/about"}>About</Item>*/}
            </Top>

            <Bottom>
                <BlankItem x={1.6} offset={1}>Blog</BlankItem>
                <Timeline>
                    {Object.keys(byMonth)
                        .map(month => {
                            return (<Period key={month}>
                                <PeriodTitle>{month}</PeriodTitle>
                                <PeriodContent>
                                    {byMonth[month].map((post, index) => (
                                        <Post key={index}>
                                            <PostTitle>
                                                <Link to={post.fields.slug}>
                                                    {" "}
                                                    {post.frontmatter.title}
                                                </Link>
                                            </PostTitle>
                                            <PostDetails>
                                                {post.timeToRead} min to read
                                            </PostDetails>
                                        </Post>
                                    ))}
                                </PeriodContent>
                            </Period>);
                        })}
                </Timeline>
            </Bottom>


        </IndexLayout>
    );
};

export const query = graphql`
    query {
        markdown: allMarkdownRemark(
            filter: {frontmatter: {draft: {ne: true}}}
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
                    month: published(formatString: "YYYY MMM")
                }
                timeToRead
            }
        }
    }
`;

export default IndexPage;
