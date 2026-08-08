import Link from "@/components/SafeLink";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const navigation = [
  { href: "/requests", label: "Requests" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/for-movers", label: "For Movers" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-container flex min-h-18 items-center justify-between gap-5">
        <Link href="/" className="brand-mark" aria-label="Movely home">
          MOVELY
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link href="/auth" className="button button-ghost">
            Login
          </Link>
          <Link href="/request/new" className="button button-primary">
            Create Request
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <details className="mobile-menu">
            <summary aria-label="Open navigation menu">
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
                Login
              </Link>
              <Link href="/request/new" className="button button-primary mt-2 w-full">
                Create Request
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
