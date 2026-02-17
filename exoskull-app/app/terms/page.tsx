import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin - ExoSkull",
  description:
    "Regulamin i Warunki Korzystania z aplikacji ExoSkull. Zasady korzystania z uslugi.",
};

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

export default function TermsOfServicePage() {
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
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Polityka Prywatnosci
            </Link>
          </nav>

          <article className="prose prose-invert prose-slate max-w-none">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Regulamin Uslugi ExoSkull
            </h1>
            <p className="text-muted-foreground mb-8">
              Wersja 2.0.0 | Obowiazuje od: 4 lutego 2026 r.
            </p>

            <hr className="border-border my-8" />

            {/* 1. OPERATOR */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                1. Operator
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
                      <td>contact@exoskull.xyz</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>

            {/* 2. CHARAKTER USLUGI */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                2. Charakter uslugi - kluczowe zastrzezenia
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  ExoSkull jest narzedziem technologicznym o charakterze
                  informacyjnym i organizacyjnym.{" "}
                  <strong>ExoSkull NIE JEST</strong> usluga medyczna,
                  terapeutyczna, prawna ani finansowa.
                </p>
                <p>
                  Modele AI sa probabilistyczne - moga zawierac bledy,
                  niescislosci i halucynacje. Uzytkownik ponosi wylaczna
                  odpowiedzialnosc za decyzje podejmowane na podstawie
                  informacji z Aplikacji.
                </p>
                <p>
                  <strong>
                    Operator nie ponosi odpowiedzialnosci za tresc generowana
                    przez sztuczna inteligencje.
                  </strong>
                </p>
              </div>
            </details>

            {/* 3. WARUNKI */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                3. Warunki korzystania
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <ul>
                  <li>Ukonczone 18 lat</li>
                  <li>Pelna zdolnosc do czynnosci prawnych</li>
                  <li>Akceptacja Regulaminu i Polityki Prywatnosci</li>
                  <li>Prawdziwe dane podczas rejestracji</li>
                </ul>
                <p>
                  Uzytkownik jest odpowiedzialny za poufnosc danych logowania i
                  wszelka aktywnosc na swoim koncie.
                </p>
              </div>
            </details>

            {/* 4. ZAKAZANE */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                4. Zakazane uzytkowanie
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <ul>
                  <li>Reverse engineering, dekompilacja, ingerencja w kod</li>
                  <li>Generowanie tresci niezgodnych z prawem</li>
                  <li>
                    Przedstawianie informacji z AI jako porad
                    medycznych/prawnych/finansowych
                  </li>
                  <li>Odsprzedawanie dostepu</li>
                  <li>Automatyczne narzedzia (boty, scrapery) bez zgody</li>
                  <li>Celowe przeciazanie infrastruktury</li>
                </ul>
              </div>
            </details>

            {/* 5. PLATNOSCI */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                5. Subskrypcje i platnosci
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Platnosci obsluguje Stripe (PCI DSS Level 1). Operator nie
                  przechowuje danych kart. Subskrypcja odnawia sie
                  automatycznie. Oplaty sa bezzwrotne, z wyjatkiem prawa
                  odstapienia w ciagu 14 dni (ustawa o prawach konsumenta) oraz
                  zwrotu za awarie dluzsza niz 72h.
                </p>
              </div>
            </details>

            {/* 6. WLASNOSC INTELEKTUALNA */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                6. Wlasnosc intelektualna
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Aplikacja, kod, design, algorytmy i modele AI sa wlasnoscia
                  Fundacji. Uzytkownik zachowuje prawa do swoich tresci, ale
                  udziela Fundacji licencji na wykorzystanie zanonimizowanych
                  danych do poprawy uslugi, badan naukowych, treningu AI i
                  publikacji. Licencja na dane zanonimizowane jest nieodwolalna
                  i bezterminowa.
                </p>
                <p>
                  Tresci generowane przez AI sa udostepniane &quot;tak jak
                  sa&quot; (AS IS) bez gwarancji.
                </p>
              </div>
            </details>

            {/* 7. OGRANICZENIE ODPOWIEDZIALNOSCI */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                7. Ograniczenie odpowiedzialnosci
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <div className="bg-card border border-border rounded-lg p-4 my-4">
                  <p className="font-semibold text-amber-400 mb-2">
                    WAZNE - PROSIMY O UWAZNE PRZECZYTANIE
                  </p>
                  <p>
                    APLIKACJA JEST UDOSTEPNIANA &quot;TAK JAK JEST&quot; (AS IS)
                    I &quot;TAK JAK JEST DOSTEPNA&quot; (AS AVAILABLE), BEZ
                    JAKICHKOLWIEK GWARANCJI.
                  </p>
                  <p className="mt-2">
                    Fundacja nie ponosi odpowiedzialnosci za szkody posrednie,
                    uboczne, szczegolne, wynikowe ani karne, w tym utrate
                    zyskow, danych, mozliwosci biznesowych. W szczegolnosci za:
                  </p>
                  <ul className="mt-2">
                    <li>Bledy, halucynacje lub niescislosci AI</li>
                    <li>Decyzje uzytkownika oparte na sugestiach AI</li>
                    <li>Przerwy w dzialaniu, utrate danych</li>
                    <li>
                      Dzialanie uslug zewnetrznych (Google, Microsoft, Oura...)
                    </li>
                    <li>
                      Problemy zdrowotne, finansowe lub osobiste zwiazane z
                      korzystaniem z Aplikacji
                    </li>
                  </ul>
                  <p className="mt-4 font-semibold">
                    LACZNA ODPOWIEDZIALNOSC FUNDACJI NIE PRZEKROCZY KWOTY OPLAT
                    SUBSKRYPCYJNYCH Z OSTATNICH 12 MIESIECY. Dla planu
                    bezplatnego: max 100 PLN.
                  </p>
                </div>
              </div>
            </details>

            {/* 8. INDEMNIFICATION */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                8. Zwolnienie z odpowiedzialnosci
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Uzytkownik zobowiazuje sie zwolnic Fundacje z
                  odpowiedzialnosci za roszczenia wynikajace z: naruszenia
                  Regulaminu, naruszenia praw osob trzecich, tresci
                  wprowadzonych do Aplikacji, korzystania niezgodnego z prawem,
                  oraz przedstawiania informacji z AI jako porad
                  specjalistycznych wobec osob trzecich.
                </p>
              </div>
            </details>

            {/* 9. DOSTEPNOSC */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                9. Dostepnosc i modyfikacja uslugi
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Operator nie gwarantuje nieprzerwanego dzialania. Zastrzega
                  sobie prawo do modyfikacji, aktualizacji lub ograniczenia
                  funkcjonalnosci, a takze zmiany modeli AI. O istotnych
                  zmianach informuje z 14-dniowym wyprzedzeniem. Moze zakonczyc
                  Usluge z 90-dniowym wyprzedzeniem (z proporcjonalnym zwrotem).
                </p>
              </div>
            </details>

            {/* 10. BADANIA */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                10. Dane i badania naukowe
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Fundacja moze wykorzystywac zanonimizowane i zagregowane dane
                  do badan naukowych, rozwoju AI, publikacji, wspolpracy z
                  uczelniami i tworzenia datasetow. Dane zanonimizowane nie
                  stanowia danych osobowych (RODO) i moga byc wykorzystywane
                  bezterminowo. Wszelkie wyniki badan sa wlasnoscia Fundacji.
                </p>
              </div>
            </details>

            {/* 11. SILA WYZSZA */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                11. Sila wyzsza
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Operator nie odpowiada za niewykonanie zobowiazan spowodowane:
                  kleskami zywiolowymi, dzialaniami wojennymi, awariami
                  infrastruktury, zmianami prawa, awariami dostawcow (modele AI,
                  chmura, API), atakami cybernetycznymi, oraz zmianami w
                  politykach dostawcow AI i integracji.
                </p>
              </div>
            </details>

            {/* 12. SPORY */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                12. Rozwiazywanie sporow
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Prawo polskie. Najpierw proba polubowna (30 dni). Konsument
                  moze korzystac z ODR (ec.europa.eu/consumers/odr), Rzecznika
                  Finansowego, Stalego Polubownego Sadu Konsumenckiego. Sad
                  wlasciwy: Warszawa (z wyjatkiem konsumentow - sad miejsca
                  zamieszkania).
                </p>
              </div>
            </details>

            {/* 13. ZMIANY */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                13. Zmiany regulaminu
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  O zmianach informujemy emailem z 30-dniowym wyprzedzeniem.
                  Kontynuacja korzystania oznacza akceptacje. Mozna usunac konto
                  przed wejsciem zmian w zycie.
                </p>
              </div>
            </details>

            {/* 14. REKLAMACJE */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                14. Reklamacje
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Email: support@exoskull.xyz. Termin rozpatrzenia: 14 dni.
                  Reklamacja powinna zawierac: dane uzytkownika, opis problemu,
                  oczekiwane rozwiazanie.
                </p>
              </div>
            </details>

            {/* KONTAKT */}
            <details open className="group border-b border-border py-4">
              <summary className="cursor-pointer flex items-center justify-between text-lg font-semibold text-foreground hover:text-primary transition-colors">
                15. Kontakt
                <ChevronDownIcon />
              </summary>
              <div className="mt-4 text-muted-foreground">
                <p>
                  Ogolne: contact@exoskull.xyz | Wsparcie: support@exoskull.xyz
                  | Prywatnosc: privacy@exoskull.xyz | Sprawy prawne:
                  legal@exoskull.xyz
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
              Pelna tresc Regulaminu (wersja 2.0.0) dostepna jest w formacie
              dokumentu na zadanie: legal@exoskull.xyz
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
