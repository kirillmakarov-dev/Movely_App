import Link from "@/components/SafeLink";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import RequestCard from "@/features/marketplace/RequestCard";
import { mockMarketplaceRequests } from "@/features/marketplace/mock-requests";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="hero-section">
          <div className="site-container grid items-center gap-12 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
            <div>
              <p className="eyebrow">הובלה, בצורה ברורה יותר</p>
              <h1 className="hero-title">צריכים להעביר משהו?</h1>
              <p className="hero-copy">
                תארו את ההובלה פעם אחת ותנו למובילים מתאימים למצוא את העבודה, בלי להתקשר לעשרות חברות.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/request/new" className="button button-primary button-large">יצירת בקשה</Link>
                <Link href="/requests" className="button button-secondary button-large">עיון בבקשות</Link>
              </div>
              <p className="mt-5 text-sm text-slate-500">היצירה בחינם. פרטי הקשר שלכם נשארים מוגנים.</p>
            </div>
            <div className="route-preview" aria-label="דוגמת בקשת הובלה מאריש לתל אביב">
              <div className="route-preview-topline">
                <span>בקשה חדשה</span>
                <span>הובלת דירה</span>
              </div>
              <div className="route-line">
                <div><span className="route-dot" /><p>חריש</p><small>איסוף</small></div>
                <span className="route-arrow" aria-hidden="true">&rarr;</span>
                <div><span className="route-dot route-dot-end" /><p>תל אביב</p><small>יעד</small></div>
              </div>
              <div className="route-stats">
                <div><strong>3</strong><span>חדרים</span></div>
                <div><strong>18</strong><span>ארגזים</span></div>
                <div><strong>18 באוגוסט</strong><span>תאריך הובלה</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="site-container">
            <div className="section-heading">
              <p className="eyebrow">בחרו את סוג ההובלה</p>
              <h2>מה צריך להעביר?</h2>
              <p>התחילו מהמסלול שמתאים לכם. אפשר לשמור טיוטה ולהמשיך אחר כך.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <article className="category-card category-card-apartment">
                <span className="category-number">01</span>
                <h3>הובלת דירה</h3>
                <p>הובלת דירה או בית מלאים, כולל ריהוט, ארגזים ומכשירי חשמל.</p>
                <Link href="/request/new/apartment" className="inline-link">יצירת הובלת דירה <span aria-hidden="true">&rarr;</span></Link>
              </article>
              <article className="category-card category-card-small">
                <span className="category-number">02</span>
                <h3>הובלה קטנה / העברת פריטים</h3>
                <p>ספה, ריהוט, מכשירי חשמל, אלקטרוניקה, ציוד, ארגזים ופריטים בודדים.</p>
                <Link href="/request/new/small-move" className="inline-link">יצירת הובלה קטנה <span aria-hidden="true">&rarr;</span></Link>
              </article>
            </div>
          </div>
        </section>

        <section className="section-block bg-white">
          <div className="site-container">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="section-heading mb-0">
                <p className="eyebrow">הזדמנויות חדשות</p>
                <h2>בקשות ההובלה האחרונות</h2>
                <p>תצוגות מקדימות בטוחות לשוק. פרטי הלקוח האישיים אינם מוצגים כאן.</p>
              </div>
              <Link href="/requests" className="button button-secondary shrink-0">צפייה בכל הבקשות</Link>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {mockMarketplaceRequests.slice(0, 3).map((request) => <RequestCard key={request.id} request={request} />)}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section-block">
          <div className="site-container">
            <div className="section-heading text-center mx-auto">
              <p className="eyebrow">פשוט, בכוונה</p>
              <h2>איך Movely עובד</h2>
            </div>
            <ol className="process-grid mt-10">
              <li><span>1</span><h3>תארו את ההובלה</h3><p>הוסיפו מסלול, פרטי גישה, תכולה, תאריך ותקציב.</p></li>
              <li><span>2</span><h3>מובילים מוצאים בקשות רלוונטיות</h3><p>הבקשה הבטוחה לשוק עוזרת לעסקים הנכונים לזהות התאמה טובה.</p></li>
              <li><span>3</span><h3>בחרו את המוביל המתאים</h3><p>השוו בין ההתעניינות והתחברו לעסק ההובלה שמתאים לכם.</p></li>
            </ol>
          </div>
        </section>

        <section className="mover-callout">
          <div className="site-container grid gap-8 py-14 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="eyebrow text-sky-300">לעסקי הובלה</p>
              <h2>אתם מובילים?</h2>
              <p>מצאו עבודות שמתאימות לאזור השירות שלכם. רכשו רק את הלידים שמעניינים אתכם. מובילי פרימיום יוכלו להגיש הצעות לפני רכישת פרטי הקשר.</p>
            </div>
            <Link href="/for-movers" className="button button-light">למובילים <span aria-hidden="true">&rarr;</span></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
