import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin - ExoSkull",
  description:
    "Regulamin i Warunki Korzystania z aplikacji ExoSkull. Zasady korzystania z uslugi.",
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
            Polityka Prywatnosci
          </Link>
        </nav>

        <article className="prose prose-invert prose-slate max-w-none">
          <h1 className="text-4xl font-bold text-white mb-2">
            Regulamin Uslugi ExoSkull
          </h1>
          <p className="text-slate-400 mb-8">
            Wersja 2.0.0 | Obowiazuje od: 4 lutego 2026 r.
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

          {/* 2. CHARAKTER USLUGI */}
          <h2>2. Charakter uslugi - kluczowe zastrzezenia</h2>
          <p>
            ExoSkull jest narzedziem technologicznym o charakterze informacyjnym
            i organizacyjnym. <strong>ExoSkull NIE JEST</strong> usluga
            medyczna, terapeutyczna, prawna ani finansowa.
          </p>
          <p>
            Modele AI sa probabilistyczne - moga zawierac bledy, niescislosci i
            halucynacje. Uzytkownik ponosi wylaczna odpowiedzialnosc za decyzje
            podejmowane na podstawie informacji z Aplikacji.
          </p>
          <p>
            <strong>
              Operator nie ponosi odpowiedzialnosci za tresc generowana przez
              sztuczna inteligencje.
            </strong>
          </p>

          {/* 3. WARUNKI */}
          <h2>3. Warunki korzystania</h2>
          <ul>
            <li>Ukonczene 18 lat</li>
            <li>Pelna zdolnosc do czynnosci prawnych</li>
            <li>Akceptacja Regulaminu i Polityki Prywatnosci</li>
            <li>Prawdziwe dane podczas rejestracji</li>
          </ul>
          <p>
            Uzytkownik jest odpowiedzialny za poufnosc danych logowania i
            wszelka aktywnosc na swoim koncie.
          </p>

          {/* 4. ZAKAZANE */}
          <h2>4. Zakazane uzytkowanie</h2>
          <ul>
            <li>Reverse engineering, dekompilacja, ingerencja w kod</li>
            <li>Generowanie tresci niezgodnych z prawem</li>
            <li>
              Przedstawianie informacji z AI jako porad medycznych/prawnych/
              finansowych
            </li>
            <li>Odsprzedawanie dostepu</li>
            <li>Automatyczne narzedzia (boty, scrapery) bez zgody</li>
            <li>Celowe przeciazanie infrastruktury</li>
          </ul>

          {/* 5. PLATNOSCI */}
          <h2>5. Subskrypcje i platnosci</h2>
          <p>
            Platnosci obsluguje Stripe (PCI DSS Level 1). Operator nie
            przechowuje danych kart. Subskrypcja odnawia sie automatycznie.
            Oplaty sa bezzwrotne, z wyjatkiem prawa odstapienia w ciagu 14 dni
            (ustawa o prawach konsumenta) oraz zwrotu za awarie dluzsza niz 72h.
          </p>

          {/* 6. WLASNOSC INTELEKTUALNA */}
          <h2>6. Wlasnosc intelektualna</h2>
          <p>
            Aplikacja, kod, design, algorytmy i modele AI sa wlasnoscia
            Fundacji. Uzytkownik zachowuje prawa do swoich tresci, ale udziela
            Fundacji licencji na wykorzystanie zanonimizowanych danych do
            poprawy uslugi, badan naukowych, treningu AI i publikacji. Licencja
            na dane zanonimizowane jest nieodwolalna i bezterminowa.
          </p>
          <p>
            Tresci generowane przez AI sa udostepniane &quot;tak jak sa&quot;
            (AS IS) bez gwarancji.
          </p>

          {/* 7. OGRANICZENIE ODPOWIEDZIALNOSCI */}
          <h2>7. Ograniczenie odpowiedzialnosci</h2>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 my-4">
            <p className="font-semibold text-amber-400 mb-2">
              WAZNE - PROSIMY O UWAZNIE PRZECZYTANIE
            </p>
            <p>
              APLIKACJA JEST UDOSTEPNIANA &quot;TAK JAK JEST&quot; (AS IS) I
              &quot;TAK JAK JEST DOSTEPNA&quot; (AS AVAILABLE), BEZ
              JAKICHKOLWIEK GWARANCJI.
            </p>
            <p className="mt-2">
              Fundacja nie ponosi odpowiedzialnosci za szkody posrednie,
              uboczne, szczegolne, wynikowe ani karne, w tym utrate zyskow,
              danych, mozliwosci biznesowych. W szczegolnosci za:
            </p>
            <ul className="mt-2">
              <li>Bledy, halucynacje lub niescislosci AI</li>
              <li>Decyzje uzytkownika oparte na sugestiach AI</li>
              <li>Przerwy w dzialaniu, utrate danych</li>
              <li>Dzialanie uslug zewnetrznych (Google, Microsoft, Oura...)</li>
              <li>
                Problemy zdrowotne, finansowe lub osobiste zwiazane z
                korzystaniem z Aplikacji
              </li>
            </ul>
            <p className="mt-4 font-semibold">
              LACZNA ODPOWIEDZIALNOSC FUNDACJI NIE PRZEKROCZY KWOTY OPLIT
              SUBSKRYPCYJNYCH Z OSTATNICH 12 MIESIECY. Dla planu bezplatnego:
              max 100 PLN.
            </p>
          </div>

          {/* 8. INDEMNIFICATION */}
          <h2>8. Zwolnienie z odpowiedzialnosci</h2>
          <p>
            Uzytkownik zobowiazuje sie zwolnic Fundacje z odpowiedzialnosci za
            roszczenia wynikajace z: naruszenia Regulaminu, naruszenia praw osob
            trzecich, tresci wprowadzonych do Aplikacji, korzystania niezgodnego
            z prawem, oraz przedstawiania informacji z AI jako porad
            specjalistycznych wobec osob trzecich.
          </p>

          {/* 9. DOSTEPNOSC */}
          <h2>9. Dostepnosc i modyfikacja uslugi</h2>
          <p>
            Operator nie gwarantuje nieprzerwanego dzialania. Zastrzega sobie
            prawo do modyfikacji, aktualizacji lub ograniczenia funkcjonalnosci,
            a takze zmiany modeli AI. O istotnych zmianach informuje z
            14-dniowym wyprzedzeniem. Moze zakronczyc Usluge z 90-dniowym
            wyprzedzeniem (z proporcjonalnym zwrotem).
          </p>

          {/* 10. BADANIA */}
          <h2>10. Dane i badania naukowe</h2>
          <p>
            Fundacja moze wykorzystywac zanonimizowane i zagregowane dane do
            badan naukowych, rozwoju AI, publikacji, wspolpracy z uczelniami i
            tworzenia datasetow. Dane zanonimizowane nie stanowia danych
            osobowych (RODO) i moga byc wykorzystywane bezterminowo. Wszelkie
            wyniki badan sa wlasnoscia Fundacji.
          </p>

          {/* 11. SILA WYZSZA */}
          <h2>11. Sila wyzsza</h2>
          <p>
            Operator nie odpowiada za niewykonanie zobowiazan spowodowane:
            klesiami zywiolowymi, dzialaniami wojennymi, awariami
            infrastruktury, zmianami prawa, awariami dostawcow (modele AI,
            chmura, API), atakami cybernetycznymi, oraz zmianami w politykach
            dostawcow AI i integracji.
          </p>

          {/* 12. SPORY */}
          <h2>12. Rozwiazywanie sporow</h2>
          <p>
            Prawo polskie. Najpierw proba polubowna (30 dni). Konsument moze
            korzystac z ODR (ec.europa.eu/consumers/odr), Rzecznika Finansowego,
            Stalego Polubownego Sadu Konsumenckiego. Sad wlasciwy: Warszawa (z
            wyjatkiem konsumentow - sad miejsca zamieszkania).
          </p>

          {/* 13. ZMIANY */}
          <h2>13. Zmiany regulaminu</h2>
          <p>
            O zmianach informujemy emailem z 30-dniowym wyprzedzeniem.
            Kontynuacja korzystania oznacza akceptacje. Mozna usunac konto przed
            wejsciem zmian w zycie.
          </p>

          {/* 14. REKLAMACJE */}
          <h2>14. Reklamacje</h2>
          <p>
            Email: support@exoskull.xyz. Termin rozpatrzenia: 14 dni. Reklamacja
            powinna zawierac: dane uzytkownika, opis problemu, oczekiwane
            rozwiazanie.
          </p>

          {/* KONTAKT */}
          <h2>15. Kontakt</h2>
          <p>
            Ogolne: contact@exoskull.xyz | Wsparcie: support@exoskull.xyz |
            Prywatnosc: privacy@exoskull.xyz | Sprawy prawne: legal@exoskull.xyz
          </p>
          <p className="text-sm text-slate-500">
            Fundacja Lokalny Certyfikowany | ul. Odkryta 44B/16, 03-140 Warszawa
            | KRS: 0000503517 | NIP: 5242768061 | REGON: 147162556
          </p>

          <hr className="border-slate-700 my-8" />

          <p className="text-sm text-slate-500">
            Pelna tresc Regulaminu (wersja 2.0.0) dostepna jest w formacie
            dokumentu na zadanie: legal@exoskull.xyz
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
