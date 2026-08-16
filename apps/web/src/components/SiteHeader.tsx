import Link from "@/components/SafeLink";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const navigation = [
  { href: "/requests", label: "בקשות" },
  { href: "/#how-it-works", label: "איך זה עובד" },
  { href: "/for-movers", label: "למובילים" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-container flex min-h-18 items-center justify-between gap-5">
        <Link href="/" className="brand-mark" aria-label="דף הבית של Movely">
          MOVELY
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="ניווט ראשי">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link href="/auth" className="button button-ghost">
            התחברות
          </Link>
          <Link href="/request/new" className="button button-primary">
            יצירת בקשה
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <details className="mobile-menu">
            <summary aria-label="פתיחת תפריט ניווט">
              <span />
              <span />
              <span />
            </summary>
            <div className="mobile-menu-panel">
              {navigation.map((item) => (
                <Link key={item.href} href={item.href} className="mobile-menu-link">
                  {item.label}
                </Link>
              ))}
              <Link href="/auth" className="mobile-menu-link">
                התחברות
              </Link>
              <Link href="/request/new" className="button button-primary mt-2 w-full">
                יצירת בקשה
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
