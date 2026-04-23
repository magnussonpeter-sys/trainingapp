import Link from "next/link";

import { uiButtonClasses } from "@/lib/ui/button-classes";
import { uiCardClasses } from "@/lib/ui/card-classes";
import { uiPageShellClasses } from "@/lib/ui/page-shell-classes";

export default function OfflinePage() {
  return (
    <main className={uiPageShellClasses.page}>
      <div className={uiPageShellClasses.content}>
        <section className={`${uiCardClasses.section} ${uiCardClasses.sectionPadded}`}>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-700">
            Offline
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Du verkar vara utan internet
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Appen sparar redan aktiva pass lokalt där det går. Anslut igen för
            AI-generering, synk och färsk historik.
          </p>
          <Link href="/home" className={`${uiButtonClasses.primary} mt-5`}>
            Försök gå till startsidan
          </Link>
        </section>
      </div>
    </main>
  );
}
