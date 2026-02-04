import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin - ExoSkull",
  description:
    "Regulamin i Warunki Korzystania z aplikacji ExoSkull. Zasady korzystania z usługi.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <nav className="flex justify-between items-center mb-12">
          <Link href="/" className="text-2xl font-bold text-white">
            ExoSkull
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Polityka Prywatności
          </Link>
        </nav>

        <article className="prose prose-invert prose-slate max-w-none">
          <h1 className="text-4xl font-bold text-white mb-2">
            Regulamin Usługi ExoSkull
          </h1>
          <p className="text-slate-400 mb-8">
            Wersja 2.0.0 | Obowiązuje od: 4 lutego 2026 r.
          </p>

          <hr className="border-slate-700 my-8" />

          {/* 1. OPERATOR */}
          <h2>1. Operator</h2>
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
                <td>contact@exoskull.xyz</td>
              </tr>
            </tbody>
          </table>

          {/* 2. CHARAKTER USŁUGI */}
          <h2>2. Charakter usługi - kluczowe zastrzeżenia</h2>
          <p>
            ExoSkull jest narzędziem technologicznym o charakterze informacyjnym
            i organizacyjnym. <strong>ExoSkull NIE JEST</strong> usługą
            medyczną, terapeutyczną, prawną ani finansową.
          </p>
          <p>
            Modele AI są probabilistyczne - mogą zawierać błędy, nieścisłości i
            halucynacje. Użytkownik ponosi wyłączną odpowiedzialność za decyzje
            podejmowane na podstawie informacji z Aplikacji.
          </p>
          <p>
            <strong>
              Operator nie ponosi odpowiedzialności za treść generowaną przez
              sztuczną inteligencję.
            </strong>
          </p>

          {/* 3. WARUNKI */}
          <h2>3. Warunki korzystania</h2>
          <ul>
            <li>Ukończone 18 lat</li>
            <li>Pełna zdolność do czynności prawnych</li>
            <li>Akceptacja Regulaminu i Polityki Prywatności</li>
            <li>Prawdziwe dane podczas rejestracji</li>
          </ul>
          <p>
            Użytkownik jest odpowiedzialny za poufność danych logowania i
            wszelką aktywność na swoim koncie.
          </p>

          {/* 4. ZAKAZANE */}
          <h2>4. Zakazane użytkowanie</h2>
          <ul>
            <li>Reverse engineering, dekompilacja, ingerencja w kod</li>
            <li>Generowanie treści niezgodnych z prawem</li>
            <li>
              Przedstawianie informacji z AI jako porad medycznych/prawnych/
              finansowych
            </li>
            <li>Odsprzedawanie dostępu</li>
            <li>Automatyczne narzędzia (boty, scrapery) bez zgody</li>
            <li>Celowe przeciążanie infrastruktury</li>
          </ul>

          {/* 5. PŁATNOŚCI */}
          <h2>5. Subskrypcje i płatności</h2>
          <p>
            Płatności obsługuje Stripe (PCI DSS Level 1). Operator nie
            przechowuje danych kart. Subskrypcja odnawia się automatycznie.
            Opłaty są bezzwrotne, z wyjątkiem prawa odstąpienia w ciągu 14 dni
            (ustawa o prawach konsumenta) oraz zwrotu za awarię dłuższą niż 72h.
          </p>

          {/* 6. WŁASNOŚĆ INTELEKTUALNA */}
          <h2>6. Własność intelektualna</h2>
          <p>
            Aplikacja, kod, design, algorytmy i modele AI są własnością
            Fundacji. Użytkownik zachowuje prawa do swoich treści, ale udziela
            Fundacji licencji na wykorzystanie zanonimizowanych danych do
            poprawy usługi, badań naukowych, treningu AI i publikacji. Licencja
            na dane zanonimizowane jest nieodwołalna i bezterminowa.
          </p>
          <p>
            Treści generowane przez AI są udostępniane &quot;tak jak są&quot;
            (AS IS) bez gwarancji.
          </p>

          {/* 7. OGRANICZENIE ODPOWIEDZIALNOŚCI */}
          <h2>7. Ograniczenie odpowiedzialności</h2>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 my-4">
            <p className="font-semibold text-amber-400 mb-2">
              WAŻNE - PROSIMY O UWAŻNE PRZECZYTANIE
            </p>
            <p>
              APLIKACJA JEST UDOSTĘPNIANA &quot;TAK JAK JEST&quot; (AS IS) I
              &quot;TAK JAK JEST DOSTĘPNA&quot; (AS AVAILABLE), BEZ
              JAKICHKOLWIEK GWARANCJI.
            </p>
            <p className="mt-2">
              Fundacja nie ponosi odpowiedzialności za szkody pośrednie,
              uboczne, szczególne, wynikowe ani karne, w tym utratę zysków,
              danych, możliwości biznesowych. W szczególności za:
            </p>
            <ul className="mt-2">
              <li>Błędy, halucynacje lub nieścisłości AI</li>
              <li>Decyzje użytkownika oparte na sugestiach AI</li>
              <li>Przerwy w działaniu, utratę danych</li>
              <li>Działanie usług zewnętrznych (Google, Microsoft, Oura...)</li>
              <li>
                Problemy zdrowotne, finansowe lub osobiste związane z
                korzystaniem z Aplikacji
              </li>
            </ul>
            <p className="mt-4 font-semibold">
              ŁĄCZNA ODPOWIEDZIALNOŚĆ FUNDACJI NIE PRZEKROCZY KWOTY OPŁAT
              SUBSKRYPCYJNYCH Z OSTATNICH 12 MIESIĘCY. Dla planu bezpłatnego:
              max 100 PLN.
            </p>
          </div>

          {/* 8. INDEMNIFICATION */}
          <h2>8. Zwolnienie z odpowiedzialności</h2>
          <p>
            Użytkownik zobowiązuje się zwolnić Fundację z odpowiedzialności za
            roszczenia wynikające z: naruszenia Regulaminu, naruszenia praw osób
            trzecich, treści wprowadzonych do Aplikacji, korzystania niezgodnego
            z prawem, oraz przedstawiania informacji z AI jako porad
            specjalistycznych wobec osób trzecich.
          </p>

          {/* 9. DOSTĘPNOŚĆ */}
          <h2>9. Dostępność i modyfikacja usługi</h2>
          <p>
            Operator nie gwarantuje nieprzerwanego działania. Zastrzega sobie
            prawo do modyfikacji, aktualizacji lub ograniczenia funkcjonalności,
            a także zmiany modeli AI. O istotnych zmianach informuje z
            14-dniowym wyprzedzeniem. Może zakończyć Usługę z 90-dniowym
            wyprzedzeniem (z proporcjonalnym zwrotem).
          </p>

          {/* 10. BADANIA */}
          <h2>10. Dane i badania naukowe</h2>
          <p>
            Fundacja może wykorzystywać zanonimizowane i zagregowane dane do
            badań naukowych, rozwoju AI, publikacji, współpracy z uczelniami i
            tworzenia datasetów. Dane zanonimizowane nie stanowią danych
            osobowych (RODO) i mogą być wykorzystywane bezterminowo. Wszelkie
            wyniki badań są własnością Fundacji.
          </p>

          {/* 11. SIŁA WYŻSZA */}
          <h2>11. Siła wyższa</h2>
          <p>
            Operator nie odpowiada za niewykonanie zobowiązań spowodowane:
            klęskami żywiołowymi, działaniami wojennymi, awariami
            infrastruktury, zmianami prawa, awariami dostawców (modele AI,
            chmura, API), atakami cybernetycznymi, oraz zmianami w politykach
            dostawców AI i integracji.
          </p>

          {/* 12. SPORY */}
          <h2>12. Rozwiązywanie sporów</h2>
          <p>
            Prawo polskie. Najpierw próba polubowna (30 dni). Konsument może
            korzystać z ODR (ec.europa.eu/consumers/odr), Rzecznika Finansowego,
            Stałego Polubownego Sądu Konsumenckiego. Sąd właściwy: Warszawa (z
            wyjątkiem konsumentów - sąd miejsca zamieszkania).
          </p>

          {/* 13. ZMIANY */}
          <h2>13. Zmiany regulaminu</h2>
          <p>
            O zmianach informujemy emailem z 30-dniowym wyprzedzeniem.
            Kontynuacja korzystania oznacza akceptację. Można usunąć konto przed
            wejściem zmian w życie.
          </p>

          {/* 14. REKLAMACJE */}
          <h2>14. Reklamacje</h2>
          <p>
            Email: support@exoskull.xyz. Termin rozpatrzenia: 14 dni. Reklamacja
            powinna zawierać: dane użytkownika, opis problemu, oczekiwane
            rozwiązanie.
          </p>

          {/* KONTAKT */}
          <h2>15. Kontakt</h2>
          <p>
            Ogólne: contact@exoskull.xyz | Wsparcie: support@exoskull.xyz |
            Prywatność: privacy@exoskull.xyz | Sprawy prawne: legal@exoskull.xyz
          </p>
          <p className="text-sm text-slate-500">
            Fundacja Lokalny Certyfikowany | ul. Odkryta 44B/16, 03-140 Warszawa
            | KRS: 0000503517 | NIP: 5242768061 | REGON: 147162556
          </p>

          <hr className="border-slate-700 my-8" />

          <p className="text-sm text-slate-500">
            Pełna treść Regulaminu (wersja 2.0.0) dostępna jest w formacie
            dokumentu na żądanie: legal@exoskull.xyz
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
