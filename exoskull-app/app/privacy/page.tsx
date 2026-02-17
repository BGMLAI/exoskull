import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka Prywatnosci - ExoSkull",
  description:
    "Polityka Prywatnosci aplikacji ExoSkull. Dowiedz sie jak chronimy Twoje dane osobowe.",
};

const TOC = [
  { id: "administrator", label: "1. Administrator" },
  { id: "charakter", label: "2. Charakter uslugi" },
  { id: "dane", label: "3. Jakie dane zbieramy" },
  { id: "cele", label: "4. Cele przetwarzania" },
  { id: "udostepnianie", label: "5. Udostepnianie" },
  { id: "przechowywanie", label: "6. Przechowywanie" },
  { id: "prawa", label: "7. Twoje prawa (RODO)" },
  { id: "bezpieczenstwo", label: "8. Bezpieczenstwo" },
  { id: "cookies", label: "9. Cookies" },
  { id: "dzieci", label: "10. Osoby niepelnoletnie" },
  { id: "zmiany", label: "11. Zmiany" },
  { id: "kontakt", label: "12. Kontakt" },
];

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded focus:z-50"
      >
        Przejdz do tresci
      </a>
      <div id="main" className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <nav className="flex justify-between items-center mb-12">
            <Link href="/" className="text-2xl font-bold text-foreground">
              ExoSkull
            </Link>
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Regulamin
            </Link>
          </nav>

          <article className="prose prose-invert prose-slate max-w-none">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Polityka Prywatnosci
            </h1>
            <p className="text-muted-foreground mb-8">
              Wersja 2.0.0 | Obowiazuje od: 4 lutego 2026 r.
            </p>

            {/* Table of Contents */}
            <nav className="bg-card border border-border rounded-lg p-4 mb-8">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Spis tresci
              </p>
              <ul className="list-none pl-0 grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                {TOC.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-muted-foreground hover:text-primary transition-colors no-underline"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <hr className="border-border my-8" />

            {/* 1. ADMINISTRATOR */}
            <details
              open
              className="group border-b border-border py-4"
              id="administrator"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                1. Administrator danych osobowych
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="font-semibold pr-4">Nazwa</td>
                      <td>Fundacja Lokalny Certyfikowany</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">KRS</td>
                      <td>0000503517</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">NIP</td>
                      <td>5242768061</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">REGON</td>
                      <td>147162556</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">Adres</td>
                      <td>ul. Odkryta 44B/16, 03-140 Warszawa</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">Email</td>
                      <td>privacy@exoskull.xyz</td>
                    </tr>
                    <tr>
                      <td className="font-semibold pr-4">DPO</td>
                      <td>dpo@exoskull.xyz</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>

            {/* 2. CHARAKTER */}
            <details
              open
              className="group border-b border-border py-4"
              id="charakter"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                2. Charakter uslugi
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  ExoSkull to narzedzie technologiczne wspierajace produktywnosc
                  i organizacje zycia codziennego. ExoSkull{" "}
                  <strong>nie jest</strong> usluga medyczna, terapeutyczna,
                  prawna ani finansowa. Wszelkie wyniki, sugestie i rekomendacje
                  generowane przez AI maja charakter wylacznie informacyjny i
                  orientacyjny.
                </p>
              </div>
            </details>

            {/* 3. DANE */}
            <details
              open
              className="group border-b border-border py-4"
              id="dane"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                3. Jakie dane zbieramy
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground space-y-3">
                <details
                  className="group/sub bg-card/30 border border-border rounded-lg p-3"
                  open
                >
                  <summary className="font-semibold cursor-pointer text-foreground/80 hover:text-foreground transition-colors">
                    3.1 Dane konta
                  </summary>
                  <p className="mt-2">
                    Numer telefonu lub email (logowanie), haslo (zaszyfrowane
                    bcrypt), jezyk, strefa czasowa. Opcjonalnie: imie, awatar,
                    data urodzenia.
                  </p>
                </details>

                <details className="group/sub bg-card/30 border border-border rounded-lg p-3">
                  <summary className="font-semibold cursor-pointer text-foreground/80 hover:text-foreground transition-colors">
                    3.2 Dane techniczne
                  </summary>
                  <p className="mt-2">
                    Adres IP, rodzaj urzadzenia i OS, wersja przegladarki,
                    identyfikator urzadzenia (MFA), zanonimizowane logi bledow,
                    crash reports.
                  </p>
                </details>

                <details className="group/sub bg-card/30 border border-border rounded-lg p-3">
                  <summary className="font-semibold cursor-pointer text-foreground/80 hover:text-foreground transition-colors">
                    3.3 System Tier
                  </summary>
                  <div className="mt-2">
                    <p>
                      <strong>Tier 1 (domyslny):</strong> Dane przetwarzane
                      lokalnie na urzadzeniu. Serwer otrzymuje jedynie
                      zagregowane statystyki (liczba sesji, dlugosc, uzywane
                      funkcje) - bez tresci rozmow.
                    </p>
                    <p>
                      <strong>Tier 2 (opt-in):</strong> Dodatkowo:
                      zanonimizowane wzorce behawioralne, biomarkery glosowe
                      (pitch, tempo - nie nagrania), dane z wearables (HRV,
                      sen), wzorce lokalizacyjne (typ, nie GPS).
                    </p>
                    <p>
                      <strong>Tier 3 (opt-in + kompensacja):</strong> Pelne
                      transkrypty rozmow, nagrania audio, nagrania ekranu (max
                      2h/tydz.) - kazde za oddzielna zgoda. Kompensacja: darmowy
                      dostep + 200 PLN/mies.
                    </p>
                  </div>
                </details>

                <details className="group/sub bg-card/30 border border-border rounded-lg p-3">
                  <summary className="font-semibold cursor-pointer text-foreground/80 hover:text-foreground transition-colors">
                    3.4 Integracje zewnetrzne (Rigs)
                  </summary>
                  <p className="mt-2">
                    Google Fit, Apple Health, Oura, Microsoft 365, Notion, Plaid
                    - kazda wymaga oddzielnej zgody OAuth. Mozna cofnac w
                    dowolnym momencie.
                  </p>
                </details>
              </div>
            </details>

            {/* 4. CELE */}
            <details
              open
              className="group border-b border-border py-4"
              id="cele"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                4. Cele przetwarzania
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <ul>
                  <li>
                    <strong>Swiadczenie uslugi:</strong> personalizacja,
                    synchronizacja, powiadomienia (Art. 6(1)(b) RODO)
                  </li>
                  <li>
                    <strong>Bezpieczenstwo:</strong> MFA, wykrywanie naduzyc,
                    monitoring (Art. 6(1)(f) RODO)
                  </li>
                  <li>
                    <strong>Poprawa uslugi:</strong> analiza agregatow,
                    diagnostyka, rozwoj funkcji (Art. 6(1)(f) RODO)
                  </li>
                  <li>
                    <strong>Badania naukowe i rozwoj AI:</strong> federated
                    learning, trening modeli, publikacje (Zgoda + Art. 89 RODO)
                  </li>
                  <li>
                    <strong>Marketing:</strong> wylacznie za zgoda (Art. 6(1)(a)
                    RODO)
                  </li>
                </ul>
              </div>
            </details>

            {/* 5. UDOSTEPNIANIE */}
            <details
              open
              className="group border-b border-border py-4"
              id="udostepnianie"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                5. Udostepnianie danych
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  <strong>Nie sprzedajemy danych osobowych.</strong> Korzystamy
                  z podwykonawcow (Supabase, Vercel, Cloudflare, VAPI,
                  Anthropic, Google, Stripe, Plaid i in.) na podstawie umow DPA.
                  Transfer poza EOG zabezpieczony Standardowymi Klauzulami
                  Umownymi (SCC).
                </p>
                <p>
                  Dane udostepniane do badan sa zawsze zanonimizowane lub
                  pseudonimizowane. Dane w pelni zanonimizowane nie stanowia
                  danych osobowych i moga byc wykorzystywane bezterminowo.
                </p>
              </div>
            </details>

            {/* 6. PRZECHOWYWANIE */}
            <details
              open
              className="group border-b border-border py-4"
              id="przechowywanie"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                6. Okres przechowywania
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <ul>
                  <li>Dane konta: przez okres korzystania z uslugi</li>
                  <li>120 dni nieaktywnosci: automatyczne usuniecie</li>
                  <li>
                    Dane badawcze zanonimizowane: do 10 lat (Tier 1), 5 lat
                    (Tier 2-3)
                  </li>
                  <li>Logi bezpieczenstwa: 1-2 lata</li>
                </ul>
              </div>
            </details>

            {/* 7. PRAWA */}
            <details
              open
              className="group border-b border-border py-4"
              id="prawa"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                7. Twoje prawa (RODO)
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <ul>
                  <li>Prawo dostepu (Art. 15)</li>
                  <li>Prawo do sprostowania (Art. 16)</li>
                  <li>Prawo do usuniecia (Art. 17)</li>
                  <li>Prawo do ograniczenia przetwarzania (Art. 18)</li>
                  <li>Prawo do przenoszenia danych (Art. 20)</li>
                  <li>Prawo do sprzeciwu (Art. 21)</li>
                  <li>Prawo do wycofania zgody (Art. 7(3))</li>
                  <li>
                    Prawo do skargi do PUODO (ul. Stawki 2, 00-193 Warszawa,
                    kancelaria@uodo.gov.pl)
                  </li>
                </ul>
                <p>
                  Realizacja praw: Ustawienia &gt; Prywatnosc lub email:
                  privacy@exoskull.xyz
                </p>
              </div>
            </details>

            {/* 8. BEZPIECZENSTWO */}
            <details
              open
              className="group border-b border-border py-4"
              id="bezpieczenstwo"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                8. Bezpieczenstwo
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Szyfrowanie AES-256-GCM (at rest), TLS 1.3 (in transit),
                  SQLCipher (na urzadzeniu). Row Level Security w bazie danych.
                  MFA. Powiadomienie o naruszeniach w ciagu 72h (Art. 33 RODO).
                </p>
              </div>
            </details>

            {/* 9. COOKIES */}
            <details
              open
              className="group border-b border-border py-4"
              id="cookies"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                9. Cookies
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Niezbedne: session_token, csrf_token, device_id. Nie uzywamy
                  Google Analytics ani Facebook Pixel. Analityka: self-hosted
                  Plausible (bez cookies, GDPR compliant).
                </p>
              </div>
            </details>

            {/* 10. DZIECI */}
            <details
              open
              className="group border-b border-border py-4"
              id="dzieci"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                10. Osoby niepelnoletnie
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  ExoSkull jest przeznaczony wylacznie dla osob 18+. Nie
                  zbieramy swiadomie danych osob ponizej 18 roku zycia.
                </p>
              </div>
            </details>

            {/* 11. ZMIANY */}
            <details
              open
              className="group border-b border-border py-4"
              id="zmiany"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                11. Zmiany w polityce
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  O istotnych zmianach informujemy emailem z 30-dniowym
                  wyprzedzeniem. Kontynuacja korzystania po tym okresie oznacza
                  akceptacje zmian.
                </p>
              </div>
            </details>

            {/* KONTAKT */}
            <details
              open
              className="group border-b border-border py-4"
              id="kontakt"
            >
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                12. Kontakt
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Prywatnosc: privacy@exoskull.xyz | DPO: dpo@exoskull.xyz |
                  Wsparcie: support@exoskull.xyz
                </p>
                <p className="text-sm text-muted-foreground">
                  Fundacja Lokalny Certyfikowany | ul. Odkryta 44B/16, 03-140
                  Warszawa | KRS: 0000503517 | NIP: 5242768061 | REGON:
                  147162556
                </p>
              </div>
            </details>

            <hr className="border-border my-8" />

            <p className="text-sm text-muted-foreground">
              Pelna tresc Polityki Prywatnosci (wersja 2.0.0) dostepna jest w
              formacie dokumentu na zadanie: privacy@exoskull.xyz
            </p>
          </article>

          <footer className="text-center text-muted-foreground text-sm py-8 mt-12 border-t border-border">
            <div className="flex gap-6 justify-center mb-4">
              <Link
                href="/privacy"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Polityka Prywatnosci
              </Link>
              <Link
                href="/terms"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Regulamin
              </Link>
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Strona glowna
              </Link>
            </div>
            ExoSkull &copy; {new Date().getFullYear()} Fundacja Lokalny
            Certyfikowany
          </footer>
        </div>
      </div>
    </>
  );
}
