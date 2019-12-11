import React from "react";
import PropTypes from "prop-types";
import { Link } from "gatsby";

import { css, Global } from "@emotion/core";
import styled from "@emotion/styled";

import { rhythm } from "../utils/typography";

import twitter from "../images/twitter.svg";
import gh from "../images/github.svg";
import lin from "../images/linkedin.svg";

const Wrapper = styled.div`
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
`;

const Content = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    margin-top: ${rhythm(2)};
    text-decoration: none;
    justify-content: space-between;
`;

const Menu = styled.div`
    display: flex;
    margin-right: ${rhythm(2)};
`;

const Contacts = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    a {
        background-image: none;
        color: #575757;
    }
`;

const FooterLink = styled.div`
    padding-right: ${rhythm(0.4)};
`;

const Social = styled.img`
    width: ${rhythm(0.5)};
    height: ${rhythm(0.5)};
    margin: 0;
`;

const EmptyLayout = ({ children }) => {
    return (
        <Wrapper>
            <Global
                styles={css`
                    html,
                    body,
                    #___gatsby,
                    #___gatsby > div {
                        height: 100vh;
                    }
                    
                    .anchor {
                      background-image: none;
                    }
                `}
            />
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

EmptyLayout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default EmptyLayout;
