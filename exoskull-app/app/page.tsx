import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { SocialProof } from "@/components/landing/SocialProof";

export const metadata: Metadata = {
  title: "ExoSkull - Adaptacyjny System Operacyjny Życia | AI Second Brain",
  description:
    "ExoSkull to Twój drugi mózg. Osobisty AI który uczy się kim jesteś, buduje narzędzia i działa za Ciebie. Voice-first, adaptive, proactive.",
  keywords: [
    "AI assistant",
    "second brain",
    "life operating system",
    "productivity",
    "personal AI",
    "voice assistant",
    "health tracking",
    "task management",
  ],
  openGraph: {
    title: "ExoSkull - Twój Drugi Mózg",
    description:
      "Adaptacyjny system operacyjny dla Twojego życia. AI który uczy się, buduje narzędzia i działa za Ciebie.",
    url: "https://exoskull.xyz",
    siteName: "ExoSkull",
    type: "website",
    locale: "pl_PL",
  },
  twitter: {
    card: "summary_large_image",
    title: "ExoSkull - Twój Drugi Mózg",
    description:
      "Adaptacyjny system operacyjny dla Twojego życia. AI który uczy się, buduje narzędzia i działa za Ciebie.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ExoSkull",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web, Android",
  description:
    "Adaptacyjny system operacyjny życia - osobisty AI który uczy się kim jesteś i pomaga Ci być lepszym.",
  url: "https://exoskull.xyz",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "PLN",
    description: "14 dni za darmo",
  },
  featureList: [
    "Voice-first AI assistant",
    "Adaptive micro-apps (Mods)",
    "Health & sleep tracking",
    "Task management",
    "Proactive interventions",
    "SMS + voice - no app needed",
  ],
};

const TESTIMONIALS = [
  {
    quote:
      "IORS wykrył że nie śpię wystarczająco i sam dostosował mój harmonogram. Genialne.",
    name: "Michał K.",
    role: "Programista",
    initials: "MK",
    color: "bg-blue-500",
  },
  {
    quote: "Zaczynałem od SMS-a, teraz nie wyobrażam sobie dnia bez ExoSkull.",
    name: "Anna W.",
    role: "Project Manager",
    initials: "AW",
    color: "bg-emerald-500",
  },
  {
    quote:
      "Wreszcie coś co naprawdę się do mnie dostosowuje zamiast na odwrót.",
    name: "Tomek R.",
    role: "Freelancer",
    initials: "TR",
    color: "bg-violet-500",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <div className="container mx-auto px-4 py-20 max-w-5xl">
        {/* Nav with anchor links */}
        <nav
          aria-label="Nawigacja główna"
          className="flex justify-between items-center mb-20"
        >
          <h1 className="text-2xl font-bold">ExoSkull</h1>
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#funkcje"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Funkcje
            </a>
            <a
              href="#jak-to-dziala"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Jak to dziala
            </a>
            <a
              href="#cennik"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cennik
            </a>
            <a
              href="#opinie"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Opinie
            </a>
            <Link
              href="/download"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              Pobierz Desktop
            </Link>
          </div>
          <Link
            href="/login"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
          >
            Zaloguj się
          </Link>
        </nav>

        <main id="main-content" role="main">
          {/* Hero */}
          <section aria-label="Wprowadzenie" className="text-center mb-12">
            <h2
              className="text-2xl sm:text-4xl md:text-5xl lg:text-7xl font-bold mb-6 leading-tight"
              id="hero-heading"
            >
              Twoj Drugi Mozg.
              <br />
              <span className="text-blue-400">
                Zbudowany Dla Ciebie. Przez AI.
              </span>
            </h2>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
              ExoSkull to adaptacyjny system operacyjny dla Twojego życia. IORS
              - Twój osobisty AI - uczy się, buduje narzędzia i działa za
              Ciebie.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login?tab=signup"
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
              >
                Zacznij za darmo
              </Link>
              <a
                href="#jak-to-dziala"
                className="px-8 py-4 border border-slate-600 hover:border-slate-500 rounded-xl text-lg font-medium transition-colors text-slate-300"
              >
                Jak to dziala?
              </a>
            </div>
          </section>

          {/* Social Proof Counter */}
          <SocialProof />

          {/* Features */}
          <div
            id="funkcje"
            className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 mt-12 scroll-mt-24"
          >
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4 text-2xl">
                🎙️
              </div>
              <h3 className="text-xl font-semibold mb-3">Voice-First</h3>
              <p className="text-slate-400">
                Rozmawiaj głosowo z IORSem. Dodawaj zadania, sprawdzaj sen,
                planuj dzień - po prostu powiedz.
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-4 text-2xl">
                🧠
              </div>
              <h3 className="text-xl font-semibold mb-3">Adaptive</h3>
              <p className="text-slate-400">
                IORS uczy się Twoich nawyków, wykrywa emocje, dostosowuje styl i
                kolory UI do Twojego stanu.
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
              <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center mb-4 text-2xl">
                🔧
              </div>
              <h3 className="text-xl font-semibold mb-3">Proactive Mods</h3>
              <p className="text-slate-400">
                IORS automatycznie buduje mikro-aplikacje dopasowane do Twoich
                celów. Sen, nastrój, finanse, nawyki.
              </p>
            </div>
          </div>

          {/* How it works */}
          <div id="jak-to-dziala" className="text-center mb-20 scroll-mt-24">
            <h2 className="text-3xl font-bold mb-8">Jak to działa?</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { step: "1", title: "Rejestracja", desc: "15 pytań, 2 minuty" },
                {
                  step: "2",
                  title: "IORS się konfiguruje",
                  desc: "Auto-instaluje Mody na podstawie Twoich celów",
                },
                {
                  step: "3",
                  title: "Rozmawiaj",
                  desc: "Głos lub tekst - IORS zawsze słucha",
                },
                {
                  step: "4",
                  title: "Żyj lepiej",
                  desc: "IORS działa w tle, Ty żyjesz",
                },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400 font-bold">
                    {item.step}
                  </div>
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div id="cennik" className="mb-20 scroll-mt-24">
            <h2 className="text-3xl font-bold text-center mb-10">Cennik</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <div className="bg-slate-800/50 border-2 border-blue-500/50 rounded-xl p-8 relative">
                <div className="absolute -top-3 left-6 px-3 py-1 bg-blue-600 rounded-full text-xs font-medium">
                  Aktualnie
                </div>
                <h3 className="text-2xl font-bold mb-2">Beta</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold">0 zl</span>
                  <span className="text-slate-500">/miesiac</span>
                </div>
                <ul className="space-y-3 text-slate-300 text-sm mb-8">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">&#10003;</span>
                    Pelny dostep do IORS (glos + tekst)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">&#10003;</span>
                    Wszystkie Mody (sen, nastroj, nawyki, finanse)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">&#10003;</span>
                    Integracje (Google, Oura, Todoist)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">&#10003;</span>
                    Pamiec bez limitu
                  </li>
                </ul>
                <Link
                  href="/login?tab=signup"
                  className="block text-center w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Zacznij za darmo
                </Link>
              </div>

              <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-8">
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold text-slate-400">TBD</span>
                </div>
                <ul className="space-y-3 text-slate-400 text-sm mb-8">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-500 mt-0.5">&#10003;</span>
                    Wszystko z Beta +
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-500 mt-0.5">&#10003;</span>
                    Autonomiczne akcje (planowanie, rezerwacje)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-500 mt-0.5">&#10003;</span>
                    Zaawansowane AI (Opus tier)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-500 mt-0.5">&#10003;</span>
                    Priority support
                  </li>
                </ul>
                <div className="block text-center w-full py-3 border border-slate-600 rounded-lg font-medium text-slate-400">
                  Wkrotce
                </div>
              </div>
            </div>
          </div>

          {/* Testimonials */}
          <div id="opinie" className="mb-20 scroll-mt-24">
            <h2 className="text-3xl font-bold text-center mb-10">
              Co mówią użytkownicy?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t) => (
                <div
                  key={t.name}
                  className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6"
                >
                  <p className="text-slate-300 mb-4 italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 ${t.color} rounded-full flex items-center justify-center text-sm font-bold text-white`}
                    >
                      {t.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <section
            aria-label="Zacznij teraz"
            className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700"
          >
            <h2 className="text-3xl font-bold mb-4">Gotowy?</h2>
            <p className="text-slate-400 mb-6">
              Twój IORS czeka. Bez karty kredytowej.
            </p>
            <Link
              href="/login?tab=signup"
              className="inline-block px-10 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
            >
              Zacznij za darmo
            </Link>
          </section>
        </main>

        {/* Footer */}
        <footer
          aria-label="Stopka"
          className="text-slate-600 text-sm py-12 mt-12 border-t border-slate-800"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Left: Brand */}
            <div className="text-center md:text-left">
              <p className="text-slate-400 font-semibold mb-1">ExoSkull</p>
              <p className="text-slate-600 text-xs max-w-xs">
                Adaptacyjny system operacyjny życia. AI który uczy się, buduje
                narzędzia i działa za Ciebie.
              </p>
            </div>

            {/* Center: Links */}
            <div className="flex gap-6">
              <Link
                href="/download"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Desktop App
              </Link>
              <Link
                href="/privacy"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Prywatność
              </Link>
              <Link
                href="/terms"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Regulamin
              </Link>
              <a
                href="mailto:kontakt@exoskull.xyz"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Kontakt
              </a>
            </div>

            {/* Right: Social + Copyright */}
            <div className="text-center md:text-right">
              <div className="flex gap-4 justify-center md:justify-end mb-2">
                <a
                  href="https://twitter.com/exoskull_ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-300 transition-colors"
                  aria-label="Twitter"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://github.com/exoskull-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-300 transition-colors"
                  aria-label="GitHub"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </a>
              </div>
              <p className="text-xs">
                &copy; {new Date().getFullYear()} Fundacja Lokalny Certyfikowany
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
