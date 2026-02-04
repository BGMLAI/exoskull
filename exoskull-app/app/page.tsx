import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { SocialProof } from "@/components/landing/SocialProof";

export const metadata: Metadata = {
  title: "ExoSkull - Adaptacyjny System Operacyjny Zycia | AI Second Brain",
  description:
    "ExoSkull to Twoj drugi mozg. Osobisty AI ktory uczy sie kim jestes, buduje narzedzia i dziala za Ciebie. Voice-first, adaptive, proactive.",
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
    title: "ExoSkull - Twoj Drugi Mozg",
    description:
      "Adaptacyjny system operacyjny dla Twojego zycia. AI ktory uczy sie, buduje narzedzia i dziala za Ciebie.",
    url: "https://exoskull.xyz",
    siteName: "ExoSkull",
    type: "website",
    locale: "pl_PL",
  },
  twitter: {
    card: "summary_large_image",
    title: "ExoSkull - Twoj Drugi Mozg",
    description:
      "Adaptacyjny system operacyjny dla Twojego zycia. AI ktory uczy sie, buduje narzedzia i dziala za Ciebie.",
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
    "Adaptacyjny system operacyjny zycia - osobisty AI ktory uczy sie kim jestes i pomaga Ci byc lepszym.",
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
      "IORS wykryl ze nie spie wystarczajaco i sam dostosowal moj harmonogram. Genialne.",
    name: "Michal K.",
    role: "Programista",
  },
  {
    quote: "Zaczynalem od SMS-a, teraz nie wyobrazam sobie dnia bez ExoSkull.",
    name: "Anna W.",
    role: "Project Manager",
  },
  {
    quote:
      "Wreszcie cos co naprawde sie do mnie dostosowuje zamiast na odwrot.",
    name: "Tomek R.",
    role: "Freelancer",
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
        <nav className="flex justify-between items-center mb-20">
          <h1 className="text-2xl font-bold">ExoSkull</h1>
          <Link
            href="/login"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
          >
            Zaloguj sie
          </Link>
        </nav>

        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your Second Brain.
            <br />
            <span className="text-blue-400">Built For You. By AI.</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            ExoSkull to adaptacyjny system operacyjny dla Twojego zycia. IORS -
            Twoj osobisty AI - uczy sie, buduje narzedzia i dziala za Ciebie.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
            >
              Zacznij za darmo
            </Link>
          </div>
        </div>

        {/* Social Proof Counter */}
        <SocialProof />

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 mt-12">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🎙️</div>
            <h3 className="text-xl font-semibold mb-3">Voice-First</h3>
            <p className="text-slate-400">
              Rozmawiaj glosowo z IORSem. Dodawaj zadania, sprawdzaj sen, planuj
              dzien - po prostu powiedz.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🧠</div>
            <h3 className="text-xl font-semibold mb-3">Adaptive</h3>
            <p className="text-slate-400">
              IORS uczy sie Twoich nawykow, wykrywa emocje, dostosowuje styl i
              kolory UI do Twojego stanu.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
            <div className="text-3xl mb-4">🔧</div>
            <h3 className="text-xl font-semibold mb-3">Proactive Mods</h3>
            <p className="text-slate-400">
              IORS automatycznie buduje mikro-aplikacje dopasowane do Twoich
              celow. Sen, nastroj, finanse, nawyki.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="text-center mb-20">
          <h3 className="text-3xl font-bold mb-8">Jak to dziala?</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Rejestracja", desc: "15 pytan, 2 minuty" },
              {
                step: "2",
                title: "IORS sie konfiguruje",
                desc: "Auto-instaluje Mody na podstawie Twoich celow",
              },
              {
                step: "3",
                title: "Rozmawiaj",
                desc: "Glos lub tekst - IORS zawsze slucha",
              },
              {
                step: "4",
                title: "Zyj lepiej",
                desc: "IORS dziala w tle, Ty zyjesz",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400 font-bold">
                  {item.step}
                </div>
                <h4 className="font-semibold mb-1">{item.title}</h4>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mb-20">
          <h3 className="text-3xl font-bold text-center mb-10">
            Co mowia uzytkownicy?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6"
              >
                <p className="text-slate-300 mb-4 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
          <h3 className="text-3xl font-bold mb-4">Gotowy?</h3>
          <p className="text-slate-400 mb-6">
            Twoj IORS czeka. Bez karty kredytowej.
          </p>
          <Link
            href="/login"
            className="inline-block px-10 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold transition-colors"
          >
            Zacznij za darmo
          </Link>
        </div>

        {/* Footer */}
        <footer className="text-center text-slate-600 text-sm py-8 mt-12">
          <div className="flex gap-6 justify-center mb-4">
            <Link
              href="/privacy"
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              Polityka Prywatnosci
            </Link>
            <Link
              href="/terms"
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              Regulamin
            </Link>
          </div>
          <p>
            ExoSkull &copy; {new Date().getFullYear()} Fundacja Lokalny
            Certyfikowany
          </p>
        </footer>
      </div>
    </div>
  );
}
