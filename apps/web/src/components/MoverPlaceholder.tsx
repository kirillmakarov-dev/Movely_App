import Link from "@/components/SafeLink";

export default function MoverPlaceholder({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="eyebrow">אזור העבודה למובילים</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-7">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-500">תצוגה מקדימה של שלב 5</p>
        <h2 className="mt-3 text-2xl font-bold">אזור העבודה הזה עדיין לא פעיל.</h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">לא מסומלצים כאן יתרות ארנק, לידים שנרכשו, הצעות או פעילות עסקית. המסגרת הזו מגדירה רק את הניווט העתידי.</p>
        {action ? <Link href={action.href} className="button button-primary mt-6">{action.label}</Link> : null}
      </div>
    </div>
  );
}
