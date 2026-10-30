"use client";

import { useRef, useState } from "react";
import Link from "@/components/SafeLink";
import Icon from "@/components/Icon";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { UI_LOCALE } from "@/lib/locale";

const navigation = [
  { href: "/#how-it-works", label: "איך זה עובד" },
  { href: "/help", label: "עזרה" },
  { href: "/for-movers", label: "למובילים" },
];

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <header className="site-header" onKeyDown={(event) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }}>
      <a className="skip-link" href="#main-content">דילוג לתוכן הראשי</a>
      <div className="site-container header-layout">
        <Link href="/" className="brand-mark" aria-label="Movely - דף הבית"><span className="brand-symbol"><Icon name="box" /></span><span dir="ltr">movely<span className="brand-dot">.</span></span></Link>
        <nav className="desktop-nav" aria-label="ניווט ראשי">{navigation.map((item) => <Link key={item.href} href={item.href} className="nav-link">{item.label}</Link>)}</nav>
        <div className="header-controls">
          <div className="desktop-actions"><Link href="/auth" className="button button-ghost">התחברות</Link><Link href="/request/new" className="button button-primary">מתחילים בקשה <Icon name="arrow" /></Link></div>
          <LanguageSwitcher currentLocale={UI_LOCALE} />
          <div className="mobile-actions"><button ref={menuButton} type="button" className="menu-toggle" aria-label={menuOpen ? "סגירת תפריט" : "פתיחת תפריט"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></div>
        </div>
      </div>
      <nav id="mobile-navigation" className="mobile-navigation" aria-label="ניווט לנייד" hidden={!menuOpen}>
        <div className="site-container"><Link href="/request/new" className="mobile-menu-link" onClick={() => setMenuOpen(false)}>בקשה חדשה</Link>{navigation.map((item) => <Link key={item.href} href={item.href} className="mobile-menu-link" onClick={() => setMenuOpen(false)}>{item.label}</Link>)}<Link href="/auth" className="mobile-menu-link" onClick={() => setMenuOpen(false)}>התחברות לחשבון</Link></div>
      </nav>
    </header>
  );
}
