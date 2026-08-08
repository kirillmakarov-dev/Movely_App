import Link from "next/link";

export default function MoverPlaceholder({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">Mover workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-7">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Phase 5 preview</p>
        <h2 className="mt-3 text-2xl font-bold">This workspace is not operational yet.</h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">No wallet balances, purchased leads, offers or business activity are being simulated. The shell establishes the future navigation only.</p>
        {action ? <Link href={action.href} className="button button-primary mt-6">{action.label}</Link> : null}
      </div>
    </div>
  );
}
