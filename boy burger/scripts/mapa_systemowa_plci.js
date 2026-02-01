const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
        Header, Footer, AlignmentType, LevelFormat, 
        HeadingLevel, BorderStyle, WidthType, PageNumber, PageBreak,
        ShadingType } = require('docx');
const fs = require('fs');

const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 52, bold: true, color: "1a1a1a", font: "Arial" },
        paragraph: { spacing: { before: 0, after: 300 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: "2c3e50", font: "Arial" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: "34495e", font: "Arial" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: "555555", font: "Arial" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullet-list",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ 
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Mapa Systemowa Relacji Plciowych - Boy Burger Project", size: 18, italics: true, color: "666666" })]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ 
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Strona ", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: " z ", size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })]
      })] })
    },
    children: [
      // TITLE
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("MAPA SYSTEMOWA RELACJI PLCIOWYCH")] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
        new TextRun({ text: "Od Rewolucji Agrarnej do Cyfrowej Destabilizacji", size: 28, italics: true, color: "555555" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [
        new TextRun({ text: "Projekt Boy Burger - Grudzien 2025 - Wersja 1.0", size: 20, color: "777777" })
      ]}),

      // WPROWADZENIE
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("WPROWADZENIE")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Wspolczesny kryzys relacji miedzy plciami nie wynika z pojedynczej przyczyny, lecz ze "),
        new TextRun({ text: "zbieznosci sil historycznych, technologicznych, komercyjnych i psychologicznych", bold: true }),
        new TextRun(", ktore systematycznie zdestabilizowaly tradycyjny kontrakt plci bez ustanowienia funkcjonalnej alternatywy.")
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Niniejsza analiza systemowa ujawnia "),
        new TextRun({ text: "12 000 lat wzajemnie wzmacniajacych sie petli sprzezen zwrotnych", bold: true }),
        new TextRun(", obecnie przyspieszajacych w kierunku "),
        new TextRun({ text: "spirali niewystarczalnosci plciowej", italics: true }),
        new TextRun(" - gdzie mezczyzni i kobiety coraz bardziej nie spelniaja wzajemnych oczekiwan ewolucyjnych i kulturowo konstruowanych.")
      ]}),

      // CZESC I
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC I: FUNDAMENTALNA TRANSFORMACJA - WLASNOSC TWORZY PATRIARCHAT")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1.1 Rewolucja neolityczna (~10 000 p.n.e.)")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Dowody archeologiczne potwierdzaja teze - patriarchat wylonil sie wraz z rolnictwem - z niezwykla spojnoscia miedzy kulturami. Przed okolo 10 000 p.n.e. spoleczenstwa lowiecko-zbierackie wykazywaly wzgledny egalitaryzm plciowy. Przejscie neolityczne stworzilo trzy wzajemnie wzmacniajace sie mechanizmy:")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("Mechanizm 1: Akumulacja nadwyzek i presja dziedziczenia")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Gdy ludzie mogli magazynowac zboze, pytanie 'czyje to zboze?' wymagalo odpowiedzi. Meska kontrola nad dziedziczeniem stworzyla bodzce do kontrolowania kobiecej seksualnosci w celu zapewnienia pewnosci ojcostwa. W neolitycznych pochowkach iberyjskich "),
        new TextRun({ text: "mezczyzni przewyzszaja liczebnie kobiety o 151%", bold: true }),
        new TextRun(" - demograficzna niemozliwosc sugerujaca kulturowe uprzedzenie przeciwko upamietnaniu kobiet.")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("Mechanizm 2: Plug intensyfikuje podzial")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Wspolczesne badania wykazuja, ze tradycyjne uzycie pluga koreluje pozytywnie z postawami nierownosci plciowej "),
        new TextRun({ text: "dzisiaj", italics: true }),
        new TextRun(" - nizszym udzialem kobiet w rynku pracy, nizszym udzialem kobiet w polityce i nizsza wlasnoscia firm przez kobiety.")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("Mechanizm 3: Formowanie panstw kodyfikuje patriarchat")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Kodeks Hammurabiego skodyfikowal zasade, ze seksualnosc zony nalezy wylacznie do jej meza. Rzymskie "),
        new TextRun({ text: "patria potestas", italics: true }),
        new TextRun(" przyznawalo ojcom absolutna wladze nad czlonkami gospodarstwa domowego.")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("PETLA SPRZEZENIA ZWROTNEGO 1: WLASNOSC -> PATRIARCHAT")] }),
      new Paragraph({ shading: { fill: "f5f5f5", type: ShadingType.CLEAR }, spacing: { after: 200 }, children: [
        new TextRun({ text: "Nadwyzka rolnicza -> Potrzeba dziedziczenia -> Kontrola pewnosci ojcostwa -> Kontrola kobiecej seksualnosci -> Kodyfikacja prawna meskiej dominacji -> Wzmocnienie akumulacji meskiej wlasnosci -> [powrot do poczatku petli]", size: 20 })
      ]}),

      // CZESC II
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC II: SEPARACJA INDUSTRIALNA - KREACJA SFER")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.1 Rewolucja przemyslowa (1750-1900)")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Rewolucja przemyslowa stworzyla druga wielka destabilizacje poprzez rozdzielenie produkcji ekonomicznej od zycia domowego.")
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "Ideologia oddzielnych sfer", bold: true }),
        new TextRun(" (aktywna ~1820-1960): Mezczyzni -> publiczni aktorzy ekonomiczni; Kobiety -> prywatne strazniczki moralnosci (kult domowosci).")
      ]}),

      // CZESC III - ANTYKONCEPCJA
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC III: ZAKLUCENIE TECHNOLOGICZNE - ANTYKONCEPCJA")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1 Pigulka antykoncepcyjna (1960)")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Zatwierdzenie Enovid przez FDA w 1960 roku stanowi "),
        new TextRun({ text: "pojedyncza najbardziej znaczaca interwencje technologiczna", bold: true }),
        new TextRun(" w relacje plciowe od czasu pluga.")
      ]}),

      new Table({
        columnWidths: [3500, 2200, 2200, 1460],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wskaznik", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1960-1965", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2014-2024", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Zmiana", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Kobiety w sile roboczej USA")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("26,2 mln")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("73 mln")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "+180%", bold: true, color: "27ae60" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Udzial mezatek w rynku pracy")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("31,9%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("58,9%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "x2", bold: true, color: "27ae60" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Kobiety otrzymujace doktoraty")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("10%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("51,4%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Parytet", bold: true, color: "27ae60" })] })] }),
          ]}),
        ]
      }),

      // CZESC IV - KOMERCJALIZACJA
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC IV: KOMERCYJNA EKSPLOATACJA LEKU PLCIOWEGO")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1 Kompleks przemyslowy urody")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "Rynek globalny: 336 miliardow USD (2024)", bold: true })
      ]}),
      new Paragraph({ shading: { fill: "fff3cd", type: ShadingType.CLEAR }, spacing: { after: 200 }, children: [
        new TextRun({ text: "PETLA: Niepewnosc dotyczaca wygladu -> Zakup produktu -> Tymczasowa satysfakcja -> Nowa niepewnosc (nowy problem) -> Powtorny zakup -> [petla nieskonczona - zysk przemyslu]", size: 20 })
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2 Tradycja piersciona zareczynowego z diamentem")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Kampania De Beers 'A Diamond is Forever' (1947) niemal calkowicie "),
        new TextRun({ text: "wyprodukowala", bold: true }),
        new TextRun(" te tradycje:")
      ]}),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Przed 1947: tylko 10% panien mlodych z diamentowymi pierscionkami")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("1990: 80% panien mlodych z diamentowymi pierscionkami")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200 }, children: [new TextRun("Zasada dwumiesiecznej pensji zostala doslownie wymyslona przez agencje reklamowa")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3 Aplikacje randkowe - strukturalny konflikt interesow")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Badania Harvard Business Review: 'po znalezieniu kompatybilnego partnera uzytkownicy zazwyczaj koncza subskrypcje, szkodzac przychodom firmy.' "),
        new TextRun({ text: "Aplikacje optymalizuja pod katem zaangazowania, nie udanego dopasowania.", bold: true })
      ]}),

      // CZESC V - APLIKACJE RANDKOWE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC V: DYNAMIKA APLIKACJI RANDKOWYCH - TWIERDZENIE 80/20")] }),
      
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Wiralowe twierdzenie, ze 'kobiety oceniaja 80% mezczyzn jako ponizej sredniej' pochodzi z wpisu na blogu OKCupid z 2009 roku. Ustalenie jest prawdziwe, ale wymaga kontekstu:")
      ]}),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Kobiety rzeczywiscie ocenily ~80% mezczyzn ponizej sredniej atrakcyjnosci")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Mezczyzni tworzyli krzywa normalna wysrodkowana na sredniej")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "JEDNAK", bold: true }), new TextRun(" kobiety wysylaly wiadomosci do mezczyzn z szerszego zakresu atrakcyjnosci")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200 }, children: [new TextRun("Mezczyzni koncentrowali 2/3 wiadomosci na top 1/3 kobiet")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Dysproporcje wskaznikow dopasowania")] }),
      new Table({
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "3498db", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Plec", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "3498db", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wskaznik dopasowania", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Mezczyzni")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "0,6-2,8%", bold: true })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Kobiety")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "10-35%", bold: true })] })] }),
          ]}),
        ]
      }),
      new Paragraph({ spacing: { before: 200, after: 200 }, children: [
        new TextRun("Stosunek plci na Tinderze: "),
        new TextRun({ text: "okolo 75-78% mezczyzn", bold: true }),
        new TextRun(". Tylko "),
        new TextRun({ text: "11% uzytkownikow", bold: true }),
        new TextRun(" zglasza, ze ich aplikacja jest 'dobra w dopasowywaniu ich z ludzmi'.")
      ]}),

      // CZESC VI - HIPERGAMIA
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC VI: HIPERGAMIA - DEKLARACJE VS. ZACHOWANIE")] }),
      
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Badania Bussa (1989) stwierdzaja, ze kobiety oceniaja 'dobre perspektywy finansowe' wyzej niz mezczyzni w "),
        new TextRun({ text: "36 z 37 badanych kultur", bold: true }),
        new TextRun(".")
      ]}),

      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Badanie PLOS ONE z 2025 roku analizujace "),
        new TextRun({ text: "33 miliony malzenstw i 67 milionow urodzen w Anglii (1837-2021)", bold: true }),
        new TextRun(" stwierdzilo: 'nigdy nie bylo znaczacego hipergamicznego malzenstwa kobiet.' Sugeruje to "),
        new TextRun({ text: "malzenstwo asortatywne", italics: true }),
        new TextRun(" (rowni poslubiajacy rownych) zamiast hipergamii.")
      ]}),

      new Paragraph({ shading: { fill: "e8f4f8", type: ShadingType.CLEAR }, spacing: { after: 200 }, children: [
        new TextRun({ text: "Wiara w hipergamie ksztaltuje zachowanie nawet jesli rzeczywistosc behawioralna jest bardziej zniuansowana. Algorytmy aplikacji randkowych zoptymalizowane wokol tych przekonan moga wzmacniac dynamiki, ktore w przeciwnym razie nie dominowalyby.", italics: true })
      ]}),

      // CZESC VII - MECHANIZMY PSYCHOLOGICZNE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC VII: MECHANIZMY PSYCHOLOGICZNE - ASYMETRYCZNY BIAS")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.1 Efekt Women Are Wonderful")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Badania Eagly i Mladinic (1991) wykazaly, ze kobiety sa oceniane bardziej pozytywnie jako kategoria spoleczna.")
      ]}),

      new Table({
        columnWidths: [4680, 2340, 2340],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "9b59b6", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Ustalenie (Rudman & Goodwin 2004)", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "9b59b6", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kobiety", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "9b59b6", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Mezczyzni", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Automatyczny bias wewnatrzgrupowy")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "4,5x silniejszy", bold: true })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Neutralny")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Preferencja wewnatrzgrupowa")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Silna", bold: true })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Brak")] })] }),
          ]}),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("7.2 Epidemia meskiej samotnosci")] }),
      new Table({
        columnWidths: [4000, 2680, 2680],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "e74c3c", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wskaznik", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "e74c3c", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1990", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "e74c3c", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2022", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Mezczyzni bez bliskich przyjaciol")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("3%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "15% (5x wzrost)", bold: true, color: "c0392b" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Mezczyzni z 6+ bliskimi przyjaciolmi")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("55%")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "27% (spadek o polowe)", bold: true, color: "c0392b" })] })] }),
          ]}),
        ]
      }),

      // CZESC VIII - SYSTEMY PRAWNE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC VIII: SYSTEMY PRAWNE - OPIEKA NAD DZIECMI")] }),
      
      new Table({
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "16a085", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kraj", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "16a085", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Rowna wspolna opieka fizyczna", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Szwecja")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "42,5%", bold: true, color: "27ae60" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Belgia")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("~35%")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Francja")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("~20%")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Wegry")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "0,5%", color: "c0392b" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Wlochy")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1,9%", color: "c0392b" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, shading: { fill: "fff3cd", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "POLSKA", bold: true })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "fff3cd", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~2-5% (szacunkowo)", bold: true, color: "c0392b" })] })] }),
          ]}),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("Polski program Rodzina 500+")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Program transferow gotowkowych (500 PLN/miesiac na dziecko) "),
        new TextRun({ text: "zmniejszyl udzial kobiet w rynku pracy o 2-3 punkty procentowe", bold: true }),
        new TextRun(", z okolo 103 000 kobiet opuszczajacych rynek pracy do polowy 2017 roku.")
      ]}),

      // CZESC IX - DEMOGRAFIA
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC IX: ZAPASC DEMOGRAFICZNA - PLODNOSC")] }),
      
      new Table({
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "c0392b", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Region/Kraj", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "c0392b", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TFR (2024)", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Korea Poludniowa")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "0,7 (najnizszy na swiecie)", bold: true, color: "c0392b" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Tajwan")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("1,0")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Hongkong")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("0,75")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, shading: { fill: "fff3cd", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "POLSKA", bold: true })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "fff3cd", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1,099 (rekordowo niski)", bold: true, color: "c0392b" })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Srednia UE")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("1,46")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("USA")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("1,64")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, shading: { fill: "d5f5e3", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Wskaznik zastepowalnos ci", bold: true })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "d5f5e3", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2,1", bold: true, color: "27ae60" })] })] }),
          ]}),
        ]
      }),
      new Paragraph({ spacing: { before: 200, after: 200 }, children: [
        new TextRun({ text: "Zaden rozwiniety kraj nie osiaga wskaznika zastepowalnos ci bez znaczacej imigracji.", bold: true, italics: true })
      ]}),

      // CZESC X - MEDIA
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC X: EFEKTY MEDIALNE - PORNOGRAFIA I KULTURA")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10.1 Pornografia")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "54% nastolatkow", bold: true }), new TextRun(" widzialo pornografie przed 13. rokiem zycia")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Sredni wiek pierwszej ekspozycji: "), new TextRun({ text: "12 lat", bold: true })] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200 }, children: [new TextRun("Widoczna agresja w popularnej pornografii wzrosla z ~20% (2000) do "), new TextRun({ text: "55-60% (2020)", bold: true }), new TextRun(" - 3x wzrost")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10.2 Komedie romantyczne")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Badania pokazuja, ze fani komedii romantycznych 'czesto nie komunikuja sie skutecznie z partnerami' i wierza, ze 'jesli ktos jest dla ciebie przeznaczony, powinien wiedziec, czego chcesz, bez mowienia mu.'")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("10.3 Media spolecznosciowe - asymetria plciowa")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "25% dziewczat", bold: true }), new TextRun(" twierdzi, ze media spolecznosciowe zaszkodzily ich zdrowiu psychicznemu")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200 }, children: [new TextRun({ text: "14% chlopcow", bold: true }), new TextRun(" - dziewczeta bardziej podatne na porownania spoleczne")] }),

      // CZESC XI - PETLE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC XI: SZESC GLOWNYCH PETLI NIEWYSTARCZALNOSCI")] }),
      
      new Paragraph({ shading: { fill: "ebf5fb", type: ShadingType.CLEAR }, spacing: { after: 150 }, children: [
        new TextRun({ text: "PETLA 1: Niezaleznosc ekonomiczna -> Zdestabilizowana wymiana\n", bold: true, size: 20 }),
        new TextRun({ text: "Antykoncepcja -> Edukacja kobiet -> Niezaleznosc ekonomiczna -> Zmniejszona potrzeba meskiego zaopatrzenia -> Kryzys meskiego celu -> Meskie wycofanie -> Kobiece rozczarowanie -> Porazka relacji -> Zycie w pojedynke", size: 20 })
      ]}),

      new Paragraph({ shading: { fill: "fef9e7", type: ShadingType.CLEAR }, spacing: { after: 150 }, children: [
        new TextRun({ text: "PETLA 2: Komercyjna eksploatacja leku\n", bold: true, size: 20 }),
        new TextRun({ text: "Lek plciowy -> Marketing -> Wzmocniona niepewnosc -> Konsumpcja -> Zysk przemyslu -> Wiecej marketingu -> Wiecej leku", size: 20 })
      ]}),

      new Paragraph({ shading: { fill: "f4ecf7", type: ShadingType.CLEAR }, spacing: { after: 150 }, children: [
        new TextRun({ text: "PETLA 3: Selekcja zaposredniczona technologicznie\n", bold: true, size: 20 }),
        new TextRun({ text: "Aplikacje randkowe -> Rozszerzone wybory -> Podniesione standardy -> Zmniejszone dopasowanie -> Przedluzone zycie w pojedynke -> Kontynuowane uzywanie aplikacji -> Optymalizacja pod zaangazowanie", size: 20 })
      ]}),

      new Paragraph({ shading: { fill: "fdf2e9", type: ShadingType.CLEAR }, spacing: { after: 150 }, children: [
        new TextRun({ text: "PETLA 4: Inflacja oczekiwan medialnych\n", bold: true, size: 20 }),
        new TextRun({ text: "Konsumpcja pornografii/komedii romantycznych -> Nierealistyczne oczekiwania -> Rozczarowanie partnerami -> Niezadowolenie -> Porazka relacji -> Konsumpcja mediow dla paraspolecznej satysfakcji", size: 20 })
      ]}),

      new Paragraph({ shading: { fill: "eafaf1", type: ShadingType.CLEAR }, spacing: { after: 150 }, children: [
        new TextRun({ text: "PETLA 5: Kaskada zalamania komunikacji\n", bold: true, size: 20 }),
        new TextRun({ text: "Wzorzec zadanie-wycofanie -> Krytyka -> Defensywnosc -> Pogarda -> Stonewalling -> Rozpad relacji -> Powtorzony wzorzec w nowych relacjach", size: 20 })
      ]}),

      new Paragraph({ shading: { fill: "fdedec", type: ShadingType.CLEAR }, spacing: { after: 200 }, children: [
        new TextRun({ text: "PETLA 6: Zapasc demograficzna\n", bold: true, size: 20 }),
        new TextRun({ text: "Opoznione malzenstwo -> Opoznione rodzicielstwo -> Zmniejszona plodnosc -> Bezdzietnosc -> Zmniejszone tworzenie rodzin -> Starzenie sie spoleczenstwa -> Zmniejszone inwestycje we wsparcie rodzin", size: 20 })
      ]}),

      // CZESC XII - POROWNANIE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC XII: POROWNANIE - POLSKA vs. EUROPA vs. USA")] }),
      
      new Table({
        columnWidths: [2500, 2200, 2300, 2360],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Czynnik", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Polska", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Europa Zach.", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "2c3e50", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "USA", bold: true, color: "FFFFFF", size: 20 })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "Wskaznik dzietnosci", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1,099", size: 20, color: "c0392b" })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1,4-1,8", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "1,64", size: 20 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "Wspolna opieka", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~2-5%", size: 20, color: "c0392b" })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "10-42%", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "~20-30%", size: 20 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "Kohabitacja", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Rosnaca, nizsza", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "40%+ (Francja)", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "66%+", size: 20 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "Sekularyzacja", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Opozniona", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Zakonczona", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trwajaca", size: 20 })] })] }),
          ]}),
        ]
      }),

      // CZESC XIII - CUI BONO
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("CZESC XIII: CUI BONO - KTO KORZYSTA?")] }),
      
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("13.1 Beneficjenci komercyjni")] }),
      new Table({
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, shading: { fill: "f39c12", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Przemysl", bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders: cellBorders, shading: { fill: "f39c12", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Wartosc rynku", bold: true, color: "FFFFFF" })] })] }),
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Uroda")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "336 mld USD", bold: true })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Aplikacje randkowe")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("2,5+ mld USD")] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Przemysl weselny")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "900 mld USD globalnie", bold: true })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun("Samopomoc")] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("13,4 mld USD")] })] }),
          ]}),
        ]
      }),

      new Paragraph({ spacing: { before: 300, after: 200 }, children: [
        new TextRun({ text: "Te przemysly czerpia zyski zarowno z leku plciowego, jak i porazki relacji", bold: true }),
        new TextRun(", tworzac strukturalne zachety do utrwalania zamiast rozwiazywania napiec plciowych.")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("13.2 Kto traci")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Obie plcie doswiadczajace rosnacej samotnosci (mezczyzni bez przyjaciol: 3% -> 15%)")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Rosnaca bezdzietnosc (20-32% w rozwinietych krajach)")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun("Dzieci dotkniete ukladami opieki faworyzujacymi jednego rodzica")] }),
      new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200 }, children: [new TextRun("Spoleczenstwa stojace w obliczu zapasci demograficznej")] }),

      // PODSUMOWANIE
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("PODSUMOWANIE: ZDESTABILIZOWANY KONTRAKT PLCI")] }),
      
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Dowody ujawniaja nie pojedyncza przyczyne, ale "),
        new TextRun({ text: "zbiezna destabilizacje", bold: true }),
        new TextRun(" relacji plciowych dzialajaca w domenach historycznych, technologicznych, ekonomicznych, komercyjnych, prawnych, psychologicznych i komunikacyjnych. Kazdy czynnik wzmacnia inne poprzez petle sprzezen zwrotnych odporne na prosta interwencje.")
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Tradycyjny kontrakt plci")] }),
      new Paragraph({ spacing: { after: 150 }, children: [
        new TextRun({ text: "Stary uklad: ", bold: true }),
        new TextRun("Meskie zaopatrzenie ekonomiczne wymienione za kobieca prace domowa/reprodukcyjna, legitymizowane przez religie i egzekwowane przez prawo.")
      ]}),
      new Paragraph({ spacing: { after: 150 }, children: [
        new TextRun({ text: "Zostal podwazony przez: ", bold: true }),
        new TextRun("antykoncepcje, kobiecy udzial ekonomiczny, rozwod bez orzekania o winie, sekularyzacje, niezaleznosc zapewniana przez panstwo opiekuncze.")
      ]}),
      new Paragraph({ shading: { fill: "fbeee6", type: ShadingType.CLEAR }, spacing: { after: 200 }, children: [
        new TextRun({ text: "Zadna porownywalne kompleksowa alternatywa nie wylonila sie. Jednostki musza negocjowac uklady plciowe bez autorytatywnych szablonow, czesto domyslnie przyjmujac niekompatybilne oczekiwania wywodzace sie z roznych epok.", bold: true, italics: true })
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Zapasc plodnosci jako wskaznik systemowy")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "Zapasc plodnosci w rozwinietych krajach stanowi ostateczny wskaznik systemowy: system plciowy zawodzi w swojej najbardziej fundamentalnej funkcji biologicznej.", bold: true })
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun("Sciezka ku rozwiazaniu pozostaje niejasna, ale mapa systemowa sugeruje, ze kazda udana interwencja musiala by "),
        new TextRun({ text: "jednoczesnie adresowac wiele polaczonych domen", bold: true }),
        new TextRun(" - problem koordynacji, do ktorego rozwiazania obecne instytucje polityczne i spoleczne wydaja sie slabo przygotowane.")
      ]}),

      // FOOTER
      new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "- Koniec dokumentu -", italics: true, color: "888888" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "Projekt Boy Burger - Mapa Systemowa Relacji Plciowych - v1.0", size: 18, color: "888888" })
      ]}),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/mnt/user-data/outputs/Mapa_Systemowa_Relacji_Plciowych.docx", buffer);
  console.log("Document created successfully!");
});
