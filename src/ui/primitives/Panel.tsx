import { useId, type ReactNode } from 'react'
import styles from './Panel.module.css'

type Props = {
  code: string
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Visual accent for the header strip */
  tone?: 'default' | 'alert' | 'caution'
}

/** A section of the terminal housing. Not a card: panels share rules with neighbours. */
export function Panel({
  code,
  title,
  meta,
  children,
  className,
  bodyClassName,
  tone = 'default',
}: Props) {
  const id = useId()
  return (
    <section className={`${styles.panel} ${className ?? ''}`} aria-labelledby={id} data-tone={tone}>
      <header className={styles.head}>
        <span className={styles.code} aria-hidden="true">
          {code}
        </span>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {meta != null && <div className={styles.meta}>{meta}</div>}
      </header>
      <div className={`${styles.body} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  )
}
