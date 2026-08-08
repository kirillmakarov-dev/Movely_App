import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 sm:px-8 lg:px-10">
      <section className="max-w-2xl space-y-6">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
          Movely foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          A responsive moving marketplace, built in careful phases.
        </h1>
        <p className="text-lg leading-8 text-slate-600">
          The product architecture is approved. This repository is now in the
          implementation-foundation stage, with the auth foundation ready for
          the next phases.
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
            Next.js frontend
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
            ASP.NET Core API
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
            Modular monolith
          </span>
        </div>
        <div className="pt-2">
          <Link
            href="/auth"
            className="inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white"
          >
            Open auth foundation
          </Link>
        </div>
      </section>
    </main>
  );
}
