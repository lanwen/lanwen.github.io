import React from "react";

import EmptyLayout from "../components/empty";
import SEO from "../components/seo";
import styled from "@emotion/styled";
import { rhythm } from "../utils/typography";

const Code = styled.div`
    border-right: 2px solid;
    font-size: ${rhythm(1)};
    padding: 0 ${rhythm(0.5)};
    text-align: center;
`;

const Message = styled.div`
    font-size: ${rhythm(0.7)};
    text-align: center;
    padding: 0 ${rhythm(0.4)};
`;


const NotFoundPage = () => (
    <EmptyLayout>
        <SEO title="404: Not found" />
        <Code>404</Code><Message>NOT FOUND</Message>
    </EmptyLayout>
);

export default NotFoundPage;
