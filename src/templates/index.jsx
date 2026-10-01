import React from "react";

import { rhythm } from "../utils/typography";

import gh from "../images/github.svg";

import styles from "./index.module.css";

const cx = (...names) => names.filter(Boolean).join(" ");

// Was `styled.a` with x/offset props: the props are now inline custom
// properties, read by .item in index.module.css
const Item = ({ x, offset, className, style, ...props }) => (
    <a
        {...props}
        className={cx(styles.item, className)}
        style={{
            "--x": rhythm(x || 1),
            "--offset": rhythm(offset || 0),
            ...style,
        }}
    />
);

const BlankItem = (props) => <Item {...props} className={styles.blankItem} />;

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
        <div className={styles.indexLayout}>
            <div className={styles.top}>
                <h4>Merkushev Kirill's</h4>
                <BlankItem x={1.1} offset={1}>Projects</BlankItem>
                <div className={styles.period}>
                    <div className={styles.projectsSpacer} />
                    <div className={cx(styles.periodContent, styles.projectsLinks)}>
                        <a href={"https://coil3d.lanwen.dev"} target={"_blank"}>coil3d.lanwen.dev</a>
                        <a href={"https://lanwen.github.io/frmtr/"} target={"_blank"}>lanwen.github.io/frmtr</a>
                    </div>
                </div>
                <Item x={1.3} offset={-1} href={"https://github.com/lanwen"} target={"_blank"}><img className={styles.social} src={gh.src} alt={"Github"} /> Code</Item>
                {/*<Item x={1.8} offset={4} href={"/about"}>About</Item>*/}
            </div>

            <div className={styles.bottom}>
                <BlankItem x={1.6} offset={1}>Blog</BlankItem>
                <div className={styles.timeline}>
                    {Object.keys(byMonth)
                        .map(month => {
                            return (<div className={styles.period} key={month}>
                                <div className={styles.periodTitle}>{month}</div>
                                <div className={styles.periodContent}>
                                    {byMonth[month].map((post, index) => (
                                        <div className={styles.post} key={index}>
                                            <div className={styles.postTitle}>
                                                <a href={post.fields.slug}>
                                                    {" "}
                                                    {post.frontmatter.title}
                                                </a>
                                            </div>
                                            <div className={styles.postDetails}>
                                                {post.timeToRead} min to read
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>);
                        })}
                </div>
            </div>


        </div>
    );
};

export default IndexPage;
