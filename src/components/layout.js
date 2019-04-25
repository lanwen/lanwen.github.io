import React from "react";
import PropTypes from "prop-types";
import { graphql, Link, useStaticQuery } from "gatsby";

import { css, Global } from "@emotion/core";
import styled from "@emotion/styled";

import { rhythm } from "../utils/typography";

import twitter from "../images/twitter.svg";
import gh from "../images/github.svg";
import lin from "../images/linkedin.svg";

const Wrapper = styled.div`
    margin: 0 auto;
    max-width: 900px;
    padding: ${rhythm(2)};
    padding-top: ${rhythm(1.5)};
    display: flex;
    flex-direction: column;
    min-height: 100%;
`;

const Content = styled.div`
    flex: 1;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: ${rhythm(0.5)};
    text-decoration: none;
    width: 100%;
    justify-content: space-between;
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    margin-top: ${rhythm(2)};
    text-decoration: none;
    width: 100%;
    justify-content: space-between;
`;

const Menu = styled.div`
    display: flex;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Oxygen",
        "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
        sans-serif;
`;

const Contacts = styled.div`
    display: flex;
    align-items: center;
    a {
        background-image: none;
        color: #575757;
    }
`;

const FooterLink = styled.div`
    padding-right: ${rhythm(1.5)};
`;

const Social = styled.img`
    width: ${rhythm(0.5)};
    height: ${rhythm(0.5)};
    margin: 0;
`;

const Layout = ({ children }) => {
    const {
        site: { siteMetadata: conf },
    } = useStaticQuery(
        graphql`
            query {
                site {
                    siteMetadata {
                        title
                    }
                }
            }
        `
    );

    return (
        <Wrapper>
            <Global
                styles={css`
                    html,
                    body,
                    #___gatsby,
                    #___gatsby > div {
                        height: 100%;
                    }
                `}
            />
            <Header>
                <Link to={`/`}>{conf.title}</Link>
            </Header>

            <Content>{children}</Content>

            <Footer>
                <Menu>
                    <FooterLink>
                        <Link to={`/`}>Blog</Link>
                    </FooterLink>
                </Menu>
                <Contacts>
                    {[
                        {
                            key: "github",
                            url: "https://github.com/lanwen",
                            image: gh,
                        },
                        {
                            key: "linkedin",
                            url: "https://linkedin.com/in/kirill-merkushev/",
                            image: lin,
                        },
                        {
                            key: "twitter",
                            url: "https://twitter.com/delnariel",
                            image: twitter,
                        },
                    ].map(({ key, url, image }) => (
                        <FooterLink key={key}>
                            <a target={"_blank"} href={url}>
                                <Social src={image} alt={key} />
                            </a>
                        </FooterLink>
                    ))}
                </Contacts>
            </Footer>
        </Wrapper>
    );
};

Layout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default Layout;
