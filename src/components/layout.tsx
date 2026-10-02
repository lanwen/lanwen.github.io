import React from "react";

import { site as conf } from "../utils/site";

import gh from "../images/github.svg";
import lin from "../images/linkedin.svg";

import styles from "./layout.module.css";

const Layout = ({ children }) => {
    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <a href={`/`}>{conf.title}</a>
            </div>

            <div className={styles.content}>{children}</div>

            <div className={styles.footer}>
                <div className={styles.menu}>
                    <div className={styles.footerLink}>
                        <a href={`/`}>Blog</a>
                    </div>
                </div>
                <div className={styles.contacts}>
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
                    ].map(({ key, url, image }) => (
                        <div className={styles.footerLink} key={key}>
                            <a target={"_blank"} href={url} rel="noopener noreferrer">
                                <img className={styles.social} src={image.src} alt={key} />
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Layout;
