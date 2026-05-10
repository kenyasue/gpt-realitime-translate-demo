import styles from "./page.module.scss";

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1 className={styles.title}>GPT Realtime Translate</h1>
        <p className={styles.subtitle}>
          Next.js 15 + TypeScript + SCSS boilerplate.
        </p>
        <a className={styles.cta} href="https://nextjs.org/docs" target="_blank" rel="noreferrer">
          Read the docs
        </a>
      </section>
    </main>
  );
}
