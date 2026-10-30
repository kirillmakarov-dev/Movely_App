import Image from "next/image";
import Link from "@/components/SafeLink";
import Icon from "@/components/Icon";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

const questions = [
  ["צריך להירשם לפני שמתחילים?", "לא. אפשר להתחיל לתאר את ההובלה בלי חשבון. כדי לשמור את הבקשה בשרת צריך להתחבר, ולפני הפרסום צריך גם לאמת את מספר הטלפון."],
  ["אפשר להעביר רק ספה או מקרר?", "כן. בחרו בהובלה קטנה, הוסיפו את הפריטים וציינו מאיפה ולאן צריך להעביר אותם. אין צורך למלא פרטים על דירה שלמה."],
  ["מה אם עדיין לא יודעים את התקציב?", "זה בסדר. בשלב התקציב אפשר לבחור ״לא יודע/ת״. כדאי לתאר את הפריטים והגישה לבניין כדי לעזור למובילים להבין את העבודה."],
  ["האם שליחת בקשה היא הזמנת הובלה?", "לא. בקשה נועדה לתאר את הצורך שלכם. את המחיר הסופי, המועד ותנאי ההובלה מסכמים עם המוביל לפני שמזמינים שירות."],
  ["האם השירות כבר פתוח להזמנות?", "עדיין לא. זו גרסת היכרות שמאפשרת להכיר את תהליך יצירת הבקשה. חיבור למובילים, רכישת פרטי קשר ותשלומים ייפתחו בהמשך."],
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="home-hero" aria-labelledby="hero-heading">
          <div className="site-container hero-layout">
            <div className="hero-content">
              <p className="eyebrow hero-eyebrow"><span /> מקום חדש. התחלה פשוטה.</p>
              <h1 id="hero-heading" className="hero-title">הדרך לבית החדש.<br /><span>מתחילה כאן.</span></h1>
              <p className="hero-copy">דירה שלמה או רק ספה אחת - תארו מה צריך להעביר, מאיפה ולאן. אנחנו נעזור לכם לעשות סדר בפרטים, צעד אחר צעד.</p>
              <div className="hero-actions">
                <Link href="/request/new" className="button button-primary button-large">מתחילים את הבקשה <Icon name="arrow" /></Link>
                <Link href="#how-it-works" className="button button-secondary button-large">איך זה עובד?</Link>
              </div>
              <ul className="hero-benefits" aria-label="לפני שמתחילים">
                <li><Icon name="check" /> מתחילים בלי להירשם</li>
                <li><Icon name="check" /> בקצב שלכם</li>
              </ul>
              <p className="preview-notice"><strong>גרסת היכרות</strong> אפשר להכיר את התהליך. השירות עדיין לא פתוח להזמנות.</p>
            </div>
            <figure className="hero-figure">
              <div className="hero-image-wrap">
                <Image src="/images/moving-day.png" alt="המחשה של שני מובילים הנושאים ארגז בדירה מוארת, לצד ספה ועציצים" fill sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) 75vw, 560px" preload className="hero-image" />
                <div className="hero-image-note"><span className="icon-tile"><Icon name="house" /></span><div><strong>כל מעבר הוא התחלה</strong><span>נתחיל מהפרטים הקטנים.</span></div></div>
              </div>
              <figcaption>תמונת המחשה שנוצרה באמצעות בינה מלאכותית.</figcaption>
            </figure>
          </div>
        </section>

        <section id="move-types" className="section-block" aria-labelledby="types-heading">
          <div className="site-container">
            <div className="section-heading"><p className="eyebrow">מוצאים את המסלול שלכם</p><h2 id="types-heading">מה מעבירים היום?</h2><p>בחרו את סוג ההובלה. נציג רק את הפרטים שמתאימים לכם.</p></div>
            <div className="category-grid">
              <Link href="/request/new/apartment" className="move-choice move-choice-apartment">
                <div className="move-choice-top"><span className="choice-icon"><Icon name="house" /></span><span className="choice-tag">לבית כולו</span></div>
                <h3>עוברים דירה</h3><p>רהיטים, ארגזים וכל מה שהופך דירה לבית.</p>
                <span className="choice-detail">דירה או בית · תכולה · שירותים נוספים</span>
                <span className="choice-action">מתחילים בקשה להובלת דירה <Icon name="arrow" /></span>
              </Link>
              <Link href="/request/new/small-move" className="move-choice move-choice-small">
                <div className="move-choice-top"><span className="choice-icon"><Icon name="box" /></span><span className="choice-tag">גם לפריט אחד</span></div>
                <h3>מעבירים כמה דברים</h3><p>ספה חדשה, מקרר, שולחן או כמה ארגזים.</p>
                <span className="choice-detail">פריט אחד או יותר · בלי טופס של דירה שלמה</span>
                <span className="choice-action">מתחילים בקשה להובלה קטנה <Icon name="arrow" /></span>
              </Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section-block process-section" aria-labelledby="process-heading">
          <div className="site-container">
            <div className="section-heading"><p className="eyebrow">ברור מההתחלה</p><h2 id="process-heading">צעד קטן. פחות בלגן.</h2><p>כך ייראה התהליך כשהשירות ייפתח להזמנות.</p></div>
            <ol className="process-grid mt-10">
              <li><span>01</span><h3>מספרים מה צריך להעביר</h3><p>מוסיפים פריטים, כתובות ותאריך. אפשר לחזור ולתקן לפני הפרסום.</p></li>
              <li><span>02</span><h3>בודקים ומפרסמים</h3><p>עוברים על הפרטים ומאמתים את הטלפון. לפני הפרסום יוסבר מי יוכל לקבל את פרטי הקשר.</p></li>
              <li><span>03</span><h3>מתקדמים עם מוביל מתאים</h3><p>מדברים עם המוביל ומסכמים מחיר, מועד ומה כלול בשירות. הבקשה עצמה אינה הזמנה.</p></li>
            </ol>
          </div>
        </section>

        <section className="section-block" aria-labelledby="clarity-heading">
          <div className="site-container clarity-panel">
            <div><span className="icon-tile"><Icon name="shield" /></span><p className="eyebrow mt-6">יודעים מה השלב הבא</p><h2 id="clarity-heading">הפרטים שלכם.<br />הבחירות שלכם.</h2></div>
            <div className="clarity-list">
              <div><Icon name="check" /><div><h3>רואים הכול לפני הפרסום</h3><p>מסך סיכום מאפשר לבדוק את המסלול, התכולה והתאריך לפני שממשיכים.</p></div></div>
              <div><Icon name="check" /><div><h3>לא חייבים לדעת הכול מראש</h3><p>אפשר לציין שהתקציב אינו ידוע ולהוסיף הערות על מה שחשוב לכם.</p></div></div>
              <div><Icon name="check" /><div><h3>מסכמים את ההובלה במפורש</h3><p>יצירת בקשה אינה תשלום או התחייבות להזמין מוביל. את פרטי השירות מסכמים בנפרד.</p></div></div>
            </div>
          </div>
        </section>

        <section id="questions" className="section-block faq-section" aria-labelledby="faq-heading">
          <div className="site-container faq-layout">
            <div className="section-heading"><p className="eyebrow">קצת סדר, לפני שמתחילים</p><h2 id="faq-heading">שאלות שעולות<br />לפני מעבר</h2><p>תשובות קצרות, בלי מילים מסובכות.</p><Icon name="help" className="faq-icon" /></div>
            <div className="faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
          </div>
        </section>

        <section className="mover-callout">
          <div className="site-container mover-callout-layout">
            <span className="mover-callout-icon"><Icon name="truck" /></span>
            <div><p className="eyebrow">הצד השני של הדרך</p><h2>יש לכם עסק להובלות?</h2><p>הכירו את אזור העבודה שאנחנו בונים למובילים, עם בקשות מסודרות לפי מסלול וסוג הובלה.</p></div>
            <Link href="/for-movers" className="button button-light button-large">מידע למובילים <Icon name="arrow" /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
