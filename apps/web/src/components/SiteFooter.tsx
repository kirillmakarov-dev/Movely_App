import Link from "@/components/SafeLink";

const footerLinks = [
  { href: "/", label: "אודות" },
  { href: "/#how-it-works", label: "איך זה עובד" },
  { href: "/for-movers", label: "למובילים" },
  { href: "#", label: "תנאים" },
  { href: "#", label: "פרטיות" },
  { href: "#", label: "יצירת קשר" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-white">
      <div className="site-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Link href="/" className="brand-mark text-white" aria-label="דף הבית של Movely">
            MOVELY
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            דרך ברורה יותר לתאר את ההובלה שלכם ולהתחבר לעסקי הובלה מתאימים.
          </p>
        </div>
        <nav className="flex max-w-xl flex-wrap gap-x-6 gap-y-3" aria-label="ניווט תחתון">
          {footerLinks.map((item) => (
            <Link key={item.label} href={item.href} className="text-sm text-slate-300 transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
