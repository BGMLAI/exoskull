import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka Prywatności - ExoSkull",
  description:
    "Polityka Prywatności aplikacji ExoSkull. Dowiedz się jak chronimy Twoje dane osobowe.",
};

const TOC = [
  { id: "administrator", label: "1. Administrator" },
  { id: "charakter", label: "2. Charakter usługi" },
  { id: "dane", label: "3. Jakie dane zbieramy" },
  { id: "cele", label: "4. Cele przetwarzania" },
  { id: "udostepnianie", label: "5. Udostępnianie" },
  { id: "przechowywanie", label: "6. Przechowywanie" },
  { id: "prawa", label: "7. Twoje prawa (RODO)" },
  { id: "bezpieczenstwo", label: "8. Bezpieczeństwo" },
  { id: "cookies", label: "9. Cookies" },
  { id: "dzieci", label: "10. Osoby niepełnoletnie" },
  { id: "zmiany", label: "11. Zmiany" },
  { id: "kontakt", label: "12. Kontakt" },
];

export default function PrivacyPolicyPage() {
  return (
    <div id="main" className="min-h-screen bg-slate-900 text-slate-200">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <nav className="flex justify-between items-center mb-12">
          <Link href="/" className="text-2xl font-bold text-white">
            ExoSkull
          </Link>
          <Link
            href="/terms"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Regulamin
          </Link>
        </nav>

        <article className="prose prose-invert prose-slate max-w-none">
          <h1 className="text-4xl font-bold text-white mb-2">
            Polityka Prywatności
          </h1>
          <p className="text-slate-400 mb-8">
            Wersja 2.0.0 | Obowiązuje od: 4 lutego 2026 r.
          </p>

          {/* Table of Contents */}
          <nav className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-8">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Spis treści
            </p>
            <ul className="list-none pl-0 grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
              {TOC.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-slate-400 hover:text-cyan-400 transition-colors no-underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <hr className="border-slate-700 my-8" />

          {/* 1. ADMINISTRATOR */}
          <h2 id="administrator">1. Administrator danych osobowych</h2>
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

          {/* 2. CHARAKTER */}
          <h2 id="charakter">2. Charakter usługi</h2>
          <p>
            ExoSkull to narzędzie technologiczne wspierające produktywność i
            organizację życia codziennego. ExoSkull <strong>nie jest</strong>{" "}
            usługą medyczną, terapeutyczną, prawną ani finansową. Wszelkie
            wyniki, sugestie i rekomendacje generowane przez AI mają charakter
            wyłącznie informacyjny i orientacyjny.
          </p>

          {/* 3. DANE */}
          <h2 id="dane">3. Jakie dane zbieramy</h2>

          <details
            className="group bg-slate-800/30 border border-slate-700 rounded-lg p-3 mb-3"
            open
          >
            <summary className="font-semibold cursor-pointer text-slate-300 hover:text-white transition-colors">
              3.1 Dane konta
            </summary>
            <p className="mt-2">
              Numer telefonu lub email (logowanie), hasło (zaszyfrowane bcrypt),
              język, strefa czasowa. Opcjonalnie: imię, awatar, data urodzenia.
            </p>
          </details>

          <details className="group bg-slate-800/30 border border-slate-700 rounded-lg p-3 mb-3">
            <summary className="font-semibold cursor-pointer text-slate-300 hover:text-white transition-colors">
              3.2 Dane techniczne
            </summary>
            <p className="mt-2">
              Adres IP, rodzaj urządzenia i OS, wersja przeglądarki,
              identyfikator urządzenia (MFA), zanonimizowane logi błędów, crash
              reports.
            </p>
          </details>

          <details className="group bg-slate-800/30 border border-slate-700 rounded-lg p-3 mb-3">
            <summary className="font-semibold cursor-pointer text-slate-300 hover:text-white transition-colors">
              3.3 System Tier
            </summary>
            <div className="mt-2">
              <p>
                <strong>Tier 1 (domyślny):</strong> Dane przetwarzane lokalnie
                na urządzeniu. Serwer otrzymuje jedynie zagregowane statystyki
                (liczba sesji, długość, używane funkcje) - bez treści rozmów.
              </p>
              <p>
                <strong>Tier 2 (opt-in):</strong> Dodatkowo: zanonimizowane
                wzorce behawioralne, biomarkery głosowe (pitch, tempo - nie
                nagrania), dane z wearables (HRV, sen), wzorce lokalizacyjne
                (typ, nie GPS).
              </p>
              <p>
                <strong>Tier 3 (opt-in + kompensacja):</strong> Pełne
                transkrypty rozmów, nagrania audio, nagrania ekranu (max
                2h/tydz.) - każde za oddzielną zgodą. Kompensacja: darmowy
                dostęp + 200 PLN/mies.
              </p>
            </div>
          </details>

          <details className="group bg-slate-800/30 border border-slate-700 rounded-lg p-3 mb-3">
            <summary className="font-semibold cursor-pointer text-slate-300 hover:text-white transition-colors">
              3.4 Integracje zewnętrzne (Rigs)
            </summary>
            <p className="mt-2">
              Google Fit, Apple Health, Oura, Microsoft 365, Notion, Plaid -
              każda wymaga oddzielnej zgody OAuth. Można cofnąć w dowolnym
              momencie.
            </p>
          </details>

          {/* 4. CELE */}
          <h2 id="cele">4. Cele przetwarzania</h2>
          <ul>
            <li>
              <strong>Świadczenie usługi:</strong> personalizacja,
              synchronizacja, powiadomienia (Art. 6(1)(b) RODO)
            </li>
            <li>
              <strong>Bezpieczeństwo:</strong> MFA, wykrywanie nadużyć,
              monitoring (Art. 6(1)(f) RODO)
            </li>
            <li>
              <strong>Poprawa usługi:</strong> analiza agregatów, diagnostyka,
              rozwój funkcji (Art. 6(1)(f) RODO)
            </li>
            <li>
              <strong>Badania naukowe i rozwój AI:</strong> federated learning,
              trening modeli, publikacje (Zgoda + Art. 89 RODO)
            </li>
            <li>
              <strong>Marketing:</strong> wyłącznie za zgodą (Art. 6(1)(a) RODO)
            </li>
          </ul>

          {/* 5. UDOSTĘPNIANIE */}
          <h2 id="udostepnianie">5. Udostępnianie danych</h2>
          <p>
            <strong>Nie sprzedajemy danych osobowych.</strong> Korzystamy z
            podwykonawców (Supabase, Vercel, Cloudflare, VAPI, Anthropic,
            Google, Stripe, Plaid i in.) na podstawie umów DPA. Transfer poza
            EOG zabezpieczony Standardowymi Klauzulami Umownymi (SCC).
          </p>
          <p>
            Dane udostępniane do badań są zawsze zanonimizowane lub
            pseudonimizowane. Dane w pełni zanonimizowane nie stanowią danych
            osobowych i mogą być wykorzystywane bezterminowo.
          </p>

          {/* 6. PRZECHOWYWANIE */}
          <h2 id="przechowywanie">6. Okres przechowywania</h2>
          <ul>
            <li>Dane konta: przez okres korzystania z usługi</li>
            <li>120 dni nieaktywności: automatyczne usunięcie</li>
            <li>
              Dane badawcze zanonimizowane: do 10 lat (Tier 1), 5 lat (Tier 2-3)
            </li>
            <li>Logi bezpieczeństwa: 1-2 lata</li>
          </ul>

          {/* 7. PRAWA */}
          <h2 id="prawa">7. Twoje prawa (RODO)</h2>
          <ul>
            <li>Prawo dostępu (Art. 15)</li>
            <li>Prawo do sprostowania (Art. 16)</li>
            <li>Prawo do usunięcia (Art. 17)</li>
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
            Realizacja praw: Ustawienia &gt; Prywatność lub email:
            privacy@exoskull.xyz
          </p>

          {/* 8. BEZPIECZEŃSTWO */}
          <h2 id="bezpieczenstwo">8. Bezpieczeństwo</h2>
          <p>
            Szyfrowanie AES-256-GCM (at rest), TLS 1.3 (in transit), SQLCipher
            (na urządzeniu). Row Level Security w bazie danych. MFA.
            Powiadomienie o naruszeniach w ciągu 72h (Art. 33 RODO).
          </p>

          {/* 9. COOKIES */}
          <h2 id="cookies">9. Cookies</h2>
          <p>
            Niezbędne: session_token, csrf_token, device_id. Nie używamy Google
            Analytics ani Facebook Pixel. Analityka: self-hosted Plausible (bez
            cookies, GDPR compliant).
          </p>

          {/* 10. DZIECI */}
          <h2 id="dzieci">10. Osoby niepełnoletnie</h2>
          <p>
            ExoSkull jest przeznaczony wyłącznie dla osób 18+. Nie zbieramy
            świadomie danych osób poniżej 18 roku życia.
          </p>

          {/* 11. ZMIANY */}
          <h2 id="zmiany">11. Zmiany w polityce</h2>
          <p>
            O istotnych zmianach informujemy emailem z 30-dniowym wyprzedzeniem.
            Kontynuacja korzystania po tym okresie oznacza akceptację zmian.
          </p>

          {/* KONTAKT */}
          <h2 id="kontakt">12. Kontakt</h2>
          <p>
            Prywatność: privacy@exoskull.xyz | DPO: dpo@exoskull.xyz | Wsparcie:
            support@exoskull.xyz
          </p>
          <p className="text-sm text-slate-500">
            Fundacja Lokalny Certyfikowany | ul. Odkryta 44B/16, 03-140 Warszawa
            | KRS: 0000503517 | NIP: 5242768061 | REGON: 147162556
          </p>

          <hr className="border-slate-700 my-8" />

          <p className="text-sm text-slate-500">
            Pełna treść Polityki Prywatności (wersja 2.0.0) dostępna jest w
            formacie dokumentu na żądanie: privacy@exoskull.xyz
          </p>
        </article>

        <footer className="text-center text-slate-600 text-sm py-8 mt-12 border-t border-slate-800">
          <div className="flex gap-6 justify-center mb-4">
            <Link
              href="/privacy"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Polityka Prywatności
            </Link>
            <Link
              href="/terms"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Regulamin
            </Link>
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Strona główna
            </Link>
          </div>
          ExoSkull &copy; {new Date().getFullYear()} Fundacja Lokalny
          Certyfikowany
        </footer>
      </div>
    </div>
  );
}
