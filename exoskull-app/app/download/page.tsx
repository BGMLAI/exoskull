import Link from "next/link";
import type { Metadata } from "next";
import { DownloadButton } from "./DownloadButton";

export const metadata: Metadata = {
  title: "Pobierz ExoSkull Desktop — Windows, Mac, Linux",
  description:
    "Pobierz ExoSkull Desktop — Twój drugi mózg na biurku. Recall, dyktowanie, TTS, automatyczny upload plików. Wszystkie platformy.",
  openGraph: {
    title: "Pobierz ExoSkull Desktop",
    description:
      "Desktopowa wersja ExoSkull z Recall, asystentem głosowym i synchronizacją w chmurze.",
    url: "https://exoskull.xyz/download",
    siteName: "ExoSkull",
    type: "website",
    locale: "pl_PL",
  },
};

const PLATFORMS = [
  {
    os: "windows",
    label: "Windows",
    icon: "🪟",
    fileName: "ExoSkull_0.1.0_x64-setup.exe",
    size: "~45 MB",
    note: "Windows 10+, 64-bit",
  },
  {
    os: "mac",
    label: "macOS",
    icon: "🍎",
    fileName: "ExoSkull_0.1.0_universal.dmg",
    size: "~50 MB",
    note: "macOS 11+, Apple Silicon & Intel",
  },
  {
    os: "linux",
    label: "Linux",
    icon: "🐧",
    fileName: "ExoSkull_0.1.0_amd64.AppImage",
    size: "~55 MB",
    note: "Ubuntu 22.04+, Fedora 38+, Arch",
  },
  {
    os: "linux-deb",
    label: "Linux (.deb)",
    icon: "🐧",
    fileName: "ExoSkull_0.1.0_amd64.deb",
    size: "~40 MB",
    note: "Debian, Ubuntu, Mint",
  },
] as const;

const FEATURES = [
  {
    icon: "🔍",
    title: "Recall",
    desc: "Automatyczne screenshoty + OCR. Szukaj po tekście w każdym oknie.",
  },
  {
    icon: "🎙️",
    title: "Dyktowanie",
    desc: "Przycisk myszy → mów → tekst wpisuje się automatycznie. Wszędzie.",
  },
  {
    icon: "🔊",
    title: "Czytanie na głos",
    desc: "Zaznacz tekst + przycisk myszy → ExoSkull czyta. System lub ElevenLabs.",
  },
  {
    icon: "☁️",
    title: "Cloud Sync",
    desc: "Automatyczny upload plików z obserwowanych folderów do Twojej bazy wiedzy.",
  },
  {
    icon: "🖥️",
    title: "System Tray",
    desc: "Działa w tle. Zamknij okno — ExoSkull czuwa dalej w zasobniku.",
  },
  {
    icon: "💬",
    title: "Chat",
    desc: "Pełny czat z ExoSkull. Cele, zadania, wiedza — wszystko z desktopu.",
  },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Nav */}
        <nav className="flex justify-between items-center mb-16">
          <Link
            href="/"
            className="text-2xl font-bold hover:text-blue-400 transition-colors"
          >
            ExoSkull
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Strona główna
            </Link>
            <Link
              href="/login"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-medium"
            >
              Zaloguj się
            </Link>
          </div>
        </nav>

        <main>
          {/* Hero */}
          <section className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-6">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Desktop App — Beta
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              ExoSkull na Twoim
              <br />
              <span className="text-blue-400">biurku.</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10">
              Recall, dyktowanie, czytanie na głos i pełny czat — natywnie.
              <br />
              Jeden przycisk myszy — i ExoSkull działa.
            </p>

            {/* Main download button — auto-detects OS */}
            <DownloadButton platforms={PLATFORMS} />
          </section>

          {/* All platforms */}
          <section className="mb-20">
            <h2 className="text-sm font-medium text-slate-500 text-center mb-6 uppercase tracking-wider">
              Wszystkie platformy
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLATFORMS.map((p) => (
                <a
                  key={p.os}
                  href={`https://github.com/BGMLAI/exoskull/releases/latest/download/${p.fileName}`}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/30 p-5 text-center transition-all hover:border-blue-500/50 hover:bg-slate-800/60"
                >
                  <span className="text-3xl">{p.icon}</span>
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-xs text-slate-500">{p.size}</span>
                  <span className="text-[11px] text-slate-600">{p.note}</span>
                  <span className="mt-1 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Pobierz &darr;
                  </span>
                </a>
              ))}
            </div>
          </section>

          {/* Features */}
          <section className="mb-20">
            <h2 className="text-3xl font-bold text-center mb-10">
              Co dostajesz?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
                >
                  <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center mb-3 text-xl">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Requirements */}
          <section className="mb-20">
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-8 max-w-2xl mx-auto">
              <h3 className="font-semibold mb-4 text-center">
                Wymagania systemowe
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Windows
                  </span>
                  <p className="mt-1 text-slate-300">Windows 10+ (64-bit)</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    WebView2 (auto-instalowany)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    macOS
                  </span>
                  <p className="mt-1 text-slate-300">macOS 11 Big Sur+</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Apple Silicon & Intel
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider">
                    Linux
                  </span>
                  <p className="mt-1 text-slate-300">
                    Ubuntu 22.04+, Fedora 38+
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    WebKitGTK 4.1, X11 (Recall)
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700 mb-12">
            <h2 className="text-3xl font-bold mb-3">Nie masz konta?</h2>
            <p className="text-slate-400 mb-6">
              Zarejestruj się za darmo, potem pobierz desktopa.
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
        <footer className="text-slate-600 text-sm py-8 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-xs">
              &copy; {new Date().getFullYear()} Fundacja Lokalny Certyfikowany
            </p>
            <div className="flex gap-6">
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
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
