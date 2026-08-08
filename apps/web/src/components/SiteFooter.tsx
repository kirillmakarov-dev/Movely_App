import Link from "@/components/SafeLink";

const footerLinks = [
  { href: "/", label: "About" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/for-movers", label: "For movers" },
  { href: "#", label: "Terms" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "Contact" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-white">
      <div className="site-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Link href="/" className="brand-mark text-white" aria-label="Movely home">
            MOVELY
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            A clearer way to describe your move and connect with suitable moving businesses.
          </p>
        </div>
        <nav className="flex max-w-xl flex-wrap gap-x-6 gap-y-3" aria-label="Footer navigation">
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
