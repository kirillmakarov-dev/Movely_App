import Link from "@/components/SafeLink";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export type InformationSection = { id: string; title: string; paragraphs: string[]; bullets?: string[]; links?: { href: string; label: string }[] };
export type InformationDocument = { title: string; introduction: string; version?: string; draft?: boolean; sections: InformationSection[] };

export default function InformationPage({ document, currentHref }: { document: InformationDocument; currentHref?: "/privacy" | "/terms" }) {
  return <>
    <SiteHeader />
    <main id="main-content" tabIndex={-1} className="site-container information-page">
      <header className="information-intro">
        <Link href="/" className="inline-link">חזרה לדף הבית</Link>
        <p className="eyebrow">Movely · מידע ברור, לפני שממשיכים</p>
        <h1>{document.title}</h1>
        <p>{document.introduction}</p>
        {document.version && <p className="document-version">גרסה <bdi>{document.version}</bdi> · עודכן ב־29.10.2026</p>}
      </header>
      {currentHref && <aside className="document-notice" aria-label="גרסה קודמת"><strong>גרסה קודמת — אינה הנוסח העדכני</strong><p>המסמך נשמר כדי לאפשר לעיין בנוסח שהיה זמין בעבר. הוא אינו משנה הסכמות שכבר נרשמו.</p><Link href={currentHref} className="inline-link">מעבר לנוסח העדכני</Link></aside>}
      {document.draft && <aside className="document-notice" aria-label="מצב המסמך">
        <strong>טיוטה לבדיקה — השירות עדיין אינו פתוח לציבור</strong>
        <p>לפני השקה יש להשלים את זהות המפעיל, פרטי הקשר, ספקי השירות ומדיניות השמירה, ולסיים בדיקה משפטית. מסמך זה מציג את הכללים המוצעים ואת מצב גרסת ההיכרות; אין להסתמך עליו כאישור שהשירות מוכן להזמנות.</p>
      </aside>}
      <div className="information-layout">
        <nav className="information-toc" aria-label="תוכן העמוד"><strong>בעמוד הזה</strong><ol>{document.sections.map((section) => <li key={section.id}><Link href={`#${section.id}`}>{section.title}</Link></li>)}</ol></nav>
        <article className="information-content">
          {document.sections.map((section) => <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}>
            <h2 id={`${section.id}-heading`}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
            {section.links && <div className="flex flex-wrap gap-3">{section.links.map((link) => <Link key={link.href} href={link.href} className="button button-secondary">{link.label}</Link>)}</div>}
          </section>)}
          <div className="information-related"><Link href="/privacy">פרטיות</Link><Link href="/terms">תנאי שימוש</Link><Link href="/help">עזרה</Link><Link href="/accessibility">נגישות</Link>{document.version && <Link href="/legal/versions">גרסאות המסמכים</Link>}</div>
        </article>
      </div>
    </main>
    <SiteFooter />
  </>;
}
