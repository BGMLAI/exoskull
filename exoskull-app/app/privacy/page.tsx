import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka Prywatnosci - ExoSkull",
  description:
    "Polityka Prywatnosci aplikacji ExoSkull. Dowiedz sie jak chronimy Twoje dane osobowe.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
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
            Polityka Prywatnosci
          </h1>
          <p className="text-slate-400 mb-8">
            Wersja 2.0.0 | Obowiazuje od: 4 lutego 2026 r.
          </p>

          <hr className="border-slate-700 my-8" />

          {/* 1. ADMINISTRATOR */}
          <h2>1. Administrator danych osobowych</h2>
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

          {/* 2. CHARAKTER USLUGI */}
          <h2>2. Charakter uslugi</h2>
          <p>
            ExoSkull to narzedzie technologiczne wspierajace produktywnosc i
            organizacje zycia codziennego. ExoSkull <strong>nie jest</strong>{" "}
            usluga medyczna, terapeutyczna, prawna ani finansowa. Wszelkie
            wyniki, sugestie i rekomendacje generowane przez AI maja charakter
            wylacznie informacyjny i orientacyjny.
          </p>

          {/* 3. DANE */}
          <h2>3. Jakie dane zbieramy</h2>

          <h3>3.1 Dane konta</h3>
          <p>
            Numer telefonu lub email (logowanie), haslo (zaszyfrowane bcrypt),
            jezyk, strefa czasowa. Opcjonalnie: imie, awatar, data urodzenia.
          </p>

          <h3>3.2 Dane techniczne</h3>
          <p>
            Adres IP, rodzaj urzadzenia i OS, wersja przegladarki, identyfikator
            urzadzenia (MFA), zanonimizowane logi bledow, crash reports.
          </p>

          <h3>3.3 System Tier</h3>
          <p>
            <strong>Tier 1 (domyslny):</strong> Dane przetwarzane lokalnie na
            urzadzeniu. Serwer otrzymuje jedynie zagregowane statystyki (liczba
            sesji, dlugosc, uzywane funkcje) - bez tresci rozmow.
          </p>
          <p>
            <strong>Tier 2 (opt-in):</strong> Dodatkowo: zanonimizowane wzorce
            behawioralne, biomarkery glosowe (pitch, tempo - nie nagrania), dane
            z wearables (HRV, sen), wzorce lokalizacyjne (typ, nie GPS).
          </p>
          <p>
            <strong>Tier 3 (opt-in + kompensacja):</strong> Pelne transkrypty
            rozmow, nagrania audio, nagrania ekranu (max 2h/tydz.) - kazde za
            oddzielna zgoda. Kompensacja: darmowy dostep + 200 PLN/mies.
          </p>

          <h3>3.4 Integracje zewnetrzne (Rigs)</h3>
          <p>
            Google Fit, Apple Health, Oura, Microsoft 365, Notion, Plaid - kazda
            wymaga oddzielnej zgody OAuth. Mozna cofnac w dowolnym momencie.
          </p>

          {/* 4. CELE */}
          <h2>4. Cele przetwarzania</h2>
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
              <strong>Poprawa uslugi:</strong> analiza agregatow, diagnostyka,
              rozwoj funkcji (Art. 6(1)(f) RODO)
            </li>
            <li>
              <strong>Badania naukowe i rozwoj AI:</strong> federated learning,
              trening modeli, publikacje (Zgoda + Art. 89 RODO)
            </li>
            <li>
              <strong>Marketing:</strong> wylacznie za zgoda (Art. 6(1)(a) RODO)
            </li>
          </ul>

          {/* 5. UDOSTEPNIANIE */}
          <h2>5. Udostepnianie danych</h2>
          <p>
            <strong>Nie sprzedajemy danych osobowych.</strong> Korzystamy z
            podwykonawcow (Supabase, Vercel, Cloudflare, VAPI, Anthropic,
            Google, Stripe, Plaid i in.) na podstawie umow DPA. Transfer poza
            EOG zabezpieczony Standardowymi Klauzulami Umownymi (SCC).
          </p>
          <p>
            Dane udostepniane do badan sa zawsze zanonimizowane lub
            pseudonimizowane. Dane w pelni zanonimizowane nie stanowia danych
            osobowych i moga byc wykorzystywane bezterminowo.
          </p>

          {/* 6. PRZECHOWYWANIE */}
          <h2>6. Okres przechowywania</h2>
          <ul>
            <li>Dane konta: przez okres korzystania z uslugi</li>
            <li>120 dni nieaktywnosci: automatyczne usuniecie</li>
            <li>
              Dane badawcze zanonimizowane: do 10 lat (Tier 1), 5 lat (Tier 2-3)
            </li>
            <li>Logi bezpieczenstwa: 1-2 lata</li>
          </ul>

          {/* 7. PRAWA */}
          <h2>7. Twoje prawa (RODO)</h2>
          <ul>
            <li>Prawo dostepu (Art. 15)</li>
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
            Realizacja praw: Ustawienia &gt; Prywatnosc lub email:
            privacy@exoskull.xyz
          </p>

          {/* 8. BEZPIECZENSTWO */}
          <h2>8. Bezpieczenstwo</h2>
          <p>
            Szyfrowanie AES-256-GCM (at rest), TLS 1.3 (in transit), SQLCipher
            (na urzadzeniu). Row Level Security w bazie danych. MFA.
            Powiadomienie o naruszeniach w ciagu 72h (Art. 33 RODO).
          </p>

          {/* 9. COOKIES */}
          <h2>9. Cookies</h2>
          <p>
            Niezbedne: session_token, csrf_token, device_id. Nie uzywamy Google
            Analytics ani Facebook Pixel. Analityka: self-hosted Plausible (bez
            cookies, GDPR compliant).
          </p>

          {/* 10. DZIECI */}
          <h2>10. Osoby niepelnoletnie</h2>
          <p>
            ExoSkull jest przeznaczony wylacznie dla osob 18+. Nie zbieramy
            swiadomie danych osob ponizej 18 roku zycia.
          </p>

          {/* 11. ZMIANY */}
          <h2>11. Zmiany w polityce</h2>
          <p>
            O istotnych zmianach informujemy emailem z 30-dniowym wyprzedzeniem.
            Kontynuacja korzystania po tym okresie oznacza akceptacje zmian.
          </p>

          {/* KONTAKT */}
          <h2>12. Kontakt</h2>
          <p>
            Prywatnosc: privacy@exoskull.xyz | DPO: dpo@exoskull.xyz | Wsparcie:
            support@exoskull.xyz
          </p>
          <p className="text-sm text-slate-500">
            Fundacja Lokalny Certyfikowany | ul. Odkryta 44B/16, 03-140 Warszawa
            | KRS: 0000503517 | NIP: 5242768061 | REGON: 147162556
          </p>

          <hr className="border-slate-700 my-8" />

          <p className="text-sm text-slate-500">
            Pelna tresc Polityki Prywatnosci (wersja 2.0.0) dostepna jest w
            formacie dokumentu na zadanie: privacy@exoskull.xyz
          </p>
        </article>

        <footer className="text-center text-slate-600 text-sm py-8 mt-12 border-t border-slate-800">
          <div className="flex gap-6 justify-center mb-4">
            <Link
              href="/privacy"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Polityka Prywatnosci
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
              Strona glowna
            </Link>
          </div>
          ExoSkull &copy; {new Date().getFullYear()} Fundacja Lokalny
          Certyfikowany
        </footer>
      </div>
    </div>
  );
}
