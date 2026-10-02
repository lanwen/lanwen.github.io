import React from "react";

import EmptyLayout from "../components/empty";

import styles from "./not-found.module.css";

const NotFoundPage = () => (
    <EmptyLayout>
        <div className={styles.code}>404</div>
        <div className={styles.message}>NOT FOUND</div>
    </EmptyLayout>
);

export default NotFoundPage;
