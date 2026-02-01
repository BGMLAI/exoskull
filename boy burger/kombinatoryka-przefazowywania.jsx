import React, { useState } from 'react';

const KombinatorykaPrzefazowywania = () => {
  const [activeTab, setActiveTab] = useState('binary');
  const [selectedCombo, setSelectedCombo] = useState(null);

  // Definicje kombinacji binarnych
  const binaryCombos = {
    AA: {
      name: 'AA',
      title: 'Tło × Tło',
      subtitle: 'Trwanie bez ruchu',
      color: 'indigo',
      gradient: 'from-indigo-900 to-indigo-700',
      description: 'Głębokie pole możliwości, stabilność, potencja niezrealizowana',
      formula: 'A ⊗ A',
      tension: 0,
      examples: [
        { domain: 'Biologia', case: 'DNA bez ekspresji — genom nieaktywny' },
        { domain: 'Psyche', case: 'Nieświadomość bez aktywacji — cień ukryty' },
        { domain: 'Fizyka', case: 'Funkcja falowa bez pomiaru — superpozycja' },
        { domain: 'Społeczeństwo', case: 'Tradycja bez innowacji — stagnacja kulturowa' },
        { domain: 'Ekonomia', case: 'Kapitał bez inwestycji — martwy pieniądz' },
      ],
      consequences: {
        short: 'Stabilność, zachowanie formy, akumulacja potencjału',
        long: 'Stagnacja, brak rozwoju, entropia wewnętrzna',
        pathology: 'Skostnienie, depresja, śmierć przez nieużywanie'
      },
      archetype: 'Mędrzec zamknięty w wieży — wie wszystko, nie działa',
      bateson: 'Pętla bez wejścia zewnętrznego — system zamknięty',
      jung: 'Persona bez cienia — fałszywa integralność'
    },
    AB: {
      name: 'AB',
      title: 'Tło × Akt',
      subtitle: 'Zmiana zakorzeniona',
      color: 'emerald',
      gradient: 'from-emerald-900 to-emerald-600',
      description: 'Pole z napięciem = ruch = życie. Możliwość realizująca się.',
      formula: 'A ⊗ B',
      tension: 1,
      examples: [
        { domain: 'Biologia', case: 'DNA → transkrypcja → białko — ekspresja genu' },
        { domain: 'Psyche', case: 'Potencjał → działanie → doświadczenie' },
        { domain: 'Fizyka', case: 'Fala → pomiar → cząstka (kolaps)' },
        { domain: 'Społeczeństwo', case: 'Tradycja + innowacja — ewolucja kultury' },
        { domain: 'Serce', case: 'Rozkurcz → skurcz — bicie' },
      ],
      consequences: {
        short: 'Ruch, realizacja, manifestacja',
        long: 'Rozwój, wzrost, wzbogacenie tła',
        pathology: 'Brak (to jest zdrowa forma)'
      },
      archetype: 'Bohater wyruszający z domu — zakorzeniony, ale działający',
      bateson: 'Różnica która robi różnicę — informacja',
      jung: 'Indywiduacja — integracja świadomości z nieświadomością'
    },
    BA: {
      name: 'BA',
      title: 'Akt × Tło',
      subtitle: 'Działanie szukające pola',
      color: 'amber',
      gradient: 'from-amber-900 to-amber-600',
      description: 'Realizacja która próbuje znaleźć oparcie. Ruch bez fundamentu szukający go.',
      formula: 'B ⊗ A',
      tension: 0.7,
      examples: [
        { domain: 'Biologia', case: 'Białko szukające receptora — ligand bez celu' },
        { domain: 'Psyche', case: 'Impuls szukający sensu — acting out' },
        { domain: 'Fizyka', case: 'Cząstka szukająca stanu — tunelowanie' },
        { domain: 'Społeczeństwo', case: 'Rewolucja szukająca tradycji — legitymizacja' },
        { domain: 'Ekonomia', case: 'Spekulacja szukająca wartości realnej' },
      ],
      consequences: {
        short: 'Poszukiwanie, eksploracja, próba zakorzenienia',
        long: 'Albo znajdzie tło (→AB), albo rozpłynie się (→BB)',
        pathology: 'Niepokój, lęk egzystencjalny, bezdomność'
      },
      archetype: 'Błędny rycerz — działa, ale szuka sensu',
      bateson: 'Komunikat bez kontekstu — potencjalna schizofrenia',
      jung: 'Cień szukający integracji — nieświadoma projekcja'
    },
    BB: {
      name: 'BB',
      title: 'Akt × Akt',
      subtitle: 'Czysty ruch bez pola',
      color: 'rose',
      gradient: 'from-rose-900 to-rose-600',
      description: 'Realizacja bez tła. Działanie bez możliwości. Ruch który się rozprasza.',
      formula: 'B ⊗ B',
      tension: 0,
      examples: [
        { domain: 'Biologia', case: 'Komórka rakowa — niekontrolowana proliferacja' },
        { domain: 'Psyche', case: 'Mania — działanie bez refleksji' },
        { domain: 'Fizyka', case: 'Foton — czysta energia, brak masy spoczynkowej' },
        { domain: 'Społeczeństwo', case: 'Rewolucja permanentna — destrukcja bez budowania' },
        { domain: 'Ekonomia', case: 'Hiperinflacja — wymiana bez wartości' },
      ],
      consequences: {
        short: 'Rozproszenie, entropia, utrata formy',
        long: 'Anihilacja, śmierć przez wyczerpanie',
        pathology: 'Rozpad, psychoza, destrukcja'
      },
      archetype: 'Trickster bez granic — czysty chaos',
      bateson: 'Schizmogeneza symetryczna — eskalacja bez hamulca',
      jung: 'Inflacja ego — utożsamienie z archetypem'
    }
  };

  // Kombinacje ternarne (wybrane kluczowe)
  const ternaryCombos = {
    AAA: {
      name: 'AAA',
      title: 'Tło³',
      description: 'Czysta potencjalność. Pole bez jakiejkolwiek aktualizacji.',
      state: 'Śmierć przez niebycie',
      color: 'slate',
      example: 'Wszechświat przed Big Bangiem — możliwość wszystkiego i niczego'
    },
    AAB: {
      name: 'AAB',
      title: 'Głębokie tło + akt',
      description: 'Mocno zakorzenione działanie. Stabilna zmiana.',
      state: 'Życie dojrzałe',
      color: 'emerald',
      example: 'Mistrz — głęboka wiedza manifestująca się w precyzyjnym działaniu'
    },
    ABA: {
      name: 'ABA',
      title: 'Tło-akt-tło',
      description: 'Cykl kompletny. Działanie które wraca do źródła.',
      state: 'Spirala wznosząca',
      color: 'cyan',
      example: 'Oddech — wdech-pauza-wydech-pauza. Pełny cykl regeneracji.'
    },
    ABB: {
      name: 'ABB',
      title: 'Zakorzenione podwójne działanie',
      description: 'Tło wspiera intensywne działanie. Wysoka produktywność.',
      state: 'Flow state',
      color: 'amber',
      example: 'Sportowiec w szczycie formy — fundament + maksymalna aktywność'
    },
    BAA: {
      name: 'BAA',
      title: 'Akt szukający głębokiego tła',
      description: 'Działanie które próbuje się głęboko zakorzenić.',
      state: 'Konwersja, nawrócenie',
      color: 'violet',
      example: 'Rewolucjonista budujący instytucje — z chaosu tworzy porządek'
    },
    BAB: {
      name: 'BAB',
      title: 'Akt-tło-akt',
      description: 'Oscylacja między działaniami z chwilowym spoczynkiem.',
      state: 'Niestabilna równowaga',
      color: 'orange',
      example: 'Jonglowanie — ciągły ruch z chwilowymi punktami oparcia'
    },
    BBA: {
      name: 'BBA',
      title: 'Podwójny akt + tło',
      description: 'Intensywne działanie szukające oparcia.',
      state: 'Wypalenie szukające odpoczynku',
      color: 'rose',
      example: 'Kryzys prowadzący do transformacji — BB→A'
    },
    BBB: {
      name: 'BBB',
      title: 'Akt³',
      description: 'Czysty ruch. Działanie bez jakiegokolwiek tła.',
      state: 'Anihilacja',
      color: 'red',
      example: 'Eksplozja — czysta energia bez formy, natychmiastowe rozproszenie'
    }
  };

  // Dynamiki przejść
  const transitions = [
    { from: 'AA', to: 'AB', trigger: 'Napięcie τ > 0', result: 'Ożywienie', direction: 'Zdrowe' },
    { from: 'AB', to: 'AA', trigger: 'Wyczerpanie B', result: 'Odpoczynek', direction: 'Zdrowe' },
    { from: 'AB', to: 'BB', trigger: 'Utrata A', result: 'Rozproszenie', direction: 'Patologiczne' },
    { from: 'BB', to: 'BA', trigger: 'Szukanie A', result: 'Desperacja', direction: 'Kompensacyjne' },
    { from: 'BA', to: 'AB', trigger: 'Znalezienie A', result: 'Zakorzenienie', direction: 'Zdrowienie' },
    { from: 'BA', to: 'BB', trigger: 'Porażka', result: 'Dalszy rozpad', direction: 'Patologiczne' },
    { from: 'AA', to: 'BB', trigger: 'Nagły wybuch', result: 'Eksplozja', direction: 'Traumatyczne' },
    { from: 'BB', to: 'AA', trigger: 'Kolaps', result: 'Śmierć/reset', direction: 'Terminalne' },
  ];

  const ComboCard = ({ combo, isSelected, onClick }) => (
    <div 
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
        isSelected 
          ? `bg-gradient-to-br ${combo.gradient} border-white/30` 
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-2xl font-mono font-bold text-${combo.color}-400`}>
          {combo.name}
        </span>
        <span className="text-slate-400 text-sm">{combo.subtitle}</span>
      </div>
      <div className="text-sm text-slate-300">{combo.title}</div>
      
      {/* Tension indicator */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">τ</span>
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-${combo.color}-500`}
            style={{ width: `${combo.tension * 100}%` }}
          />
        </div>
      </div>
    </div>
  );

  const selected = selectedCombo ? binaryCombos[selectedCombo] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-light tracking-wide mb-2">
          KOMBINATORYKA PRZEFAZOWYWANIA
        </h1>
        <p className="text-slate-400">
          Wszystkie formy organizacji A i B oraz ich następstwa
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-4 mb-8">
        {[
          { id: 'binary', label: 'Binarne (2)' },
          { id: 'ternary', label: 'Ternarne (3)' },
          { id: 'dynamics', label: 'Dynamika przejść' },
          { id: 'hierarchy', label: 'Hierarchia życia' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedCombo(null); }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-indigo-600 text-white' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'binary' && (
        <div className="max-w-6xl mx-auto">
          {/* 2x2 Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {Object.entries(binaryCombos).map(([key, combo]) => (
              <ComboCard 
                key={key}
                combo={combo}
                isSelected={selectedCombo === key}
                onClick={() => setSelectedCombo(selectedCombo === key ? null : key)}
              />
            ))}
          </div>

          {/* Matrix visualization */}
          <div className="bg-slate-900 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-medium mb-4 text-center">Macierz kombinacji</h3>
            <div className="max-w-md mx-auto">
              <div className="grid grid-cols-3 gap-2">
                <div></div>
                <div className="text-center text-indigo-400 font-mono">A</div>
                <div className="text-center text-rose-400 font-mono">B</div>
                <div className="text-right text-indigo-400 font-mono pr-2">A</div>
                <div 
                  className={`p-3 rounded text-center cursor-pointer transition-all ${
                    selectedCombo === 'AA' ? 'bg-indigo-700 ring-2 ring-indigo-400' : 'bg-indigo-900/50 hover:bg-indigo-800/50'
                  }`}
                  onClick={() => setSelectedCombo('AA')}
                >
                  <div className="font-mono font-bold">AA</div>
                  <div className="text-xs text-slate-400">Trwanie</div>
                </div>
                <div 
                  className={`p-3 rounded text-center cursor-pointer transition-all ${
                    selectedCombo === 'AB' ? 'bg-emerald-700 ring-2 ring-emerald-400' : 'bg-emerald-900/50 hover:bg-emerald-800/50'
                  }`}
                  onClick={() => setSelectedCombo('AB')}
                >
                  <div className="font-mono font-bold">AB</div>
                  <div className="text-xs text-slate-400">Życie</div>
                </div>
                <div className="text-right text-rose-400 font-mono pr-2">B</div>
                <div 
                  className={`p-3 rounded text-center cursor-pointer transition-all ${
                    selectedCombo === 'BA' ? 'bg-amber-700 ring-2 ring-amber-400' : 'bg-amber-900/50 hover:bg-amber-800/50'
                  }`}
                  onClick={() => setSelectedCombo('BA')}
                >
                  <div className="font-mono font-bold">BA</div>
                  <div className="text-xs text-slate-400">Szukanie</div>
                </div>
                <div 
                  className={`p-3 rounded text-center cursor-pointer transition-all ${
                    selectedCombo === 'BB' ? 'bg-rose-700 ring-2 ring-rose-400' : 'bg-rose-900/50 hover:bg-rose-800/50'
                  }`}
                  onClick={() => setSelectedCombo('BB')}
                >
                  <div className="font-mono font-bold">BB</div>
                  <div className="text-xs text-slate-400">Rozproszenie</div>
                </div>
              </div>
            </div>
            
            {/* Kluczowa formuła */}
            <div className="mt-6 text-center">
              <div className="inline-block bg-slate-800 rounded-lg px-6 py-3">
                <span className="text-indigo-400 font-mono">AA</span>
                <span className="text-slate-500 mx-2">×</span>
                <span className="text-emerald-400 font-mono">AB</span>
                <span className="text-slate-500 mx-2">=</span>
                <span className="text-amber-400 font-mono">Ω</span>
                <span className="text-slate-400 ml-3 text-sm">(życie które trwa i rośnie)</span>
              </div>
            </div>
          </div>

          {/* Detailed view */}
          {selected && (
            <div className={`bg-gradient-to-br ${selected.gradient} rounded-2xl p-6`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-3xl font-mono font-bold">{selected.name}</h2>
                  <p className="text-lg text-white/80">{selected.title}</p>
                </div>
                <span className="text-sm bg-black/20 px-3 py-1 rounded-full font-mono">
                  {selected.formula}
                </span>
              </div>
              
              <p className="text-white/90 mb-6">{selected.description}</p>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {/* Przykłady */}
                <div className="bg-black/20 rounded-xl p-4">
                  <h4 className="font-medium mb-3 text-white/80">Przykłady</h4>
                  <div className="space-y-2">
                    {selected.examples.map((ex, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-white/60">{ex.domain}:</span>
                        <span className="ml-2 text-white/90">{ex.case}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Konsekwencje */}
                <div className="bg-black/20 rounded-xl p-4">
                  <h4 className="font-medium mb-3 text-white/80">Konsekwencje</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-emerald-300">Krótkoterminowe:</span>
                      <span className="ml-2 text-white/90">{selected.consequences.short}</span>
                    </div>
                    <div>
                      <span className="text-amber-300">Długoterminowe:</span>
                      <span className="ml-2 text-white/90">{selected.consequences.long}</span>
                    </div>
                    <div>
                      <span className="text-rose-300">Patologia:</span>
                      <span className="ml-2 text-white/90">{selected.consequences.pathology}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bateson + Jung */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-xs text-white/50 mb-1">Archetyp</div>
                  <div className="text-sm">{selected.archetype}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-xs text-white/50 mb-1">Bateson</div>
                  <div className="text-sm">{selected.bateson}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-xs text-white/50 mb-1">Jung</div>
                  <div className="text-sm">{selected.jung}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'ternary' && (
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(ternaryCombos).map(([key, combo]) => (
              <div 
                key={key}
                className={`bg-${combo.color}-900/30 border border-${combo.color}-700/50 rounded-xl p-4`}
              >
                <div className={`text-xl font-mono font-bold text-${combo.color}-400 mb-1`}>
                  {combo.name}
                </div>
                <div className="text-sm text-slate-300 mb-2">{combo.title}</div>
                <div className="text-xs text-slate-400 mb-3">{combo.description}</div>
                <div className={`text-xs px-2 py-1 bg-${combo.color}-900/50 rounded inline-block`}>
                  {combo.state}
                </div>
                <div className="mt-3 text-xs text-slate-500 italic">
                  {combo.example}
                </div>
              </div>
            ))}
          </div>

          {/* Sześcian kombinacji */}
          <div className="mt-8 bg-slate-900 rounded-xl p-6">
            <h3 className="text-lg font-medium mb-4 text-center">Spektrum życia → śmierci</h3>
            <div className="flex items-center justify-between gap-2 overflow-x-auto py-4">
              {['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB'].map((combo, i) => {
                const c = ternaryCombos[combo];
                const intensity = i / 7;
                return (
                  <div 
                    key={combo}
                    className="flex flex-col items-center min-w-[80px]"
                  >
                    <div 
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-xs font-mono font-bold`}
                      style={{ 
                        background: `linear-gradient(135deg, 
                          hsl(${240 - intensity * 240}, 70%, ${40 - intensity * 20}%), 
                          hsl(${240 - intensity * 240}, 70%, ${30 - intensity * 15}%))`
                      }}
                    >
                      {combo}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 text-center">
                      {c.state}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-2 px-4">
              <span>← Czysta potencja</span>
              <span>Czyste działanie →</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dynamics' && (
        <div className="max-w-4xl mx-auto">
          {/* Diagram przepływów */}
          <div className="bg-slate-900 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-medium mb-6 text-center">Przejścia między stanami</h3>
            
            <svg viewBox="0 0 400 300" className="w-full max-w-lg mx-auto">
              {/* Nodes */}
              <g>
                <circle cx="100" cy="80" r="35" fill="#312e81" stroke="#6366f1" strokeWidth="2"/>
                <text x="100" y="85" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">AA</text>
                
                <circle cx="300" cy="80" r="35" fill="#064e3b" stroke="#10b981" strokeWidth="2"/>
                <text x="300" y="85" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">AB</text>
                
                <circle cx="100" cy="220" r="35" fill="#78350f" stroke="#f59e0b" strokeWidth="2"/>
                <text x="100" y="225" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">BA</text>
                
                <circle cx="300" cy="220" r="35" fill="#881337" stroke="#f43f5e" strokeWidth="2"/>
                <text x="300" y="225" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">BB</text>
              </g>

              {/* Arrows */}
              <defs>
                <marker id="arrowGreen" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#10b981"/>
                </marker>
                <marker id="arrowRed" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#f43f5e"/>
                </marker>
                <marker id="arrowYellow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
                </marker>
              </defs>

              {/* AA ↔ AB (healthy cycle) */}
              <path d="M 135 70 Q 200 40 265 70" fill="none" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)"/>
              <path d="M 265 90 Q 200 120 135 90" fill="none" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)"/>
              <text x="200" y="35" textAnchor="middle" fill="#10b981" fontSize="9">napięcie τ↑</text>
              <text x="200" y="130" textAnchor="middle" fill="#10b981" fontSize="9">odpoczynek</text>

              {/* AB → BB (loss) */}
              <path d="M 300 115 L 300 185" fill="none" stroke="#f43f5e" strokeWidth="2" markerEnd="url(#arrowRed)"/>
              <text x="315" y="150" fill="#f43f5e" fontSize="9">utrata A</text>

              {/* BB → BA (seeking) */}
              <path d="M 265 220 L 135 220" fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrowYellow)"/>
              <text x="200" y="240" textAnchor="middle" fill="#f59e0b" fontSize="9">szukanie A</text>

              {/* BA → AB (recovery) */}
              <path d="M 120 185 Q 200 150 280 115" fill="none" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)"/>
              <text x="180" y="160" fill="#10b981" fontSize="9">zakorzenienie</text>

              {/* BA → BB (failure) */}
              <path d="M 135 230 Q 200 260 265 230" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="5,5" markerEnd="url(#arrowRed)"/>
              <text x="200" y="275" textAnchor="middle" fill="#f43f5e" fontSize="9">porażka</text>

              {/* Legend */}
              <g transform="translate(10, 270)">
                <line x1="0" y1="0" x2="20" y2="0" stroke="#10b981" strokeWidth="2"/>
                <text x="25" y="4" fill="#94a3b8" fontSize="8">zdrowe</text>
                <line x1="70" y1="0" x2="90" y2="0" stroke="#f43f5e" strokeWidth="2"/>
                <text x="95" y="4" fill="#94a3b8" fontSize="8">patologiczne</text>
                <line x1="160" y1="0" x2="180" y2="0" stroke="#f59e0b" strokeWidth="2"/>
                <text x="185" y="4" fill="#94a3b8" fontSize="8">kompensacyjne</text>
              </g>
            </svg>
          </div>

          {/* Transition table */}
          <div className="bg-slate-900 rounded-xl p-4">
            <h4 className="font-medium mb-4">Tabela przejść</h4>
            <div className="space-y-2">
              {transitions.map((t, i) => (
                <div 
                  key={i}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    t.direction === 'Zdrowe' ? 'bg-emerald-900/20' :
                    t.direction === 'Patologiczne' ? 'bg-rose-900/20' :
                    t.direction === 'Kompensacyjne' ? 'bg-amber-900/20' :
                    'bg-slate-800/50'
                  }`}
                >
                  <span className="font-mono w-8">{t.from}</span>
                  <span className="text-slate-500">→</span>
                  <span className="font-mono w-8">{t.to}</span>
                  <span className="text-slate-400 flex-1">gdy: {t.trigger}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    t.direction === 'Zdrowe' ? 'bg-emerald-800 text-emerald-200' :
                    t.direction === 'Patologiczne' ? 'bg-rose-800 text-rose-200' :
                    t.direction === 'Kompensacyjne' ? 'bg-amber-800 text-amber-200' :
                    'bg-slate-700'
                  }`}>
                    {t.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hierarchy' && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-900 rounded-xl p-6">
            <h3 className="text-lg font-medium mb-6 text-center">Hierarchia form życia</h3>
            
            <div className="space-y-4">
              {/* Poziom 1: Optimum */}
              <div className="bg-gradient-to-r from-emerald-900/50 to-cyan-900/50 rounded-xl p-4 border border-emerald-700/50">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">🌀</div>
                  <div>
                    <div className="font-mono text-emerald-400">AA × AB = Ω</div>
                    <div className="text-sm text-slate-300">Życie optymalne — trwanie × zmiana</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Spirala wznosząca. Stabilne tło wspiera dynamiczną zmianę. Rozwój.
                    </div>
                  </div>
                </div>
              </div>

              {/* Poziom 2: AB dominant */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">⚡</div>
                  <div>
                    <div className="font-mono text-amber-400">AB (samo)</div>
                    <div className="text-sm text-slate-300">Życie aktywne — zmiana bez trwania</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Wysokie napięcie, ale brak głębi. Ryzyko wypalenia. Flow bez fundamentu.
                    </div>
                  </div>
                </div>
              </div>

              {/* Poziom 3: AA dominant */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">🌑</div>
                  <div>
                    <div className="font-mono text-indigo-400">AA (samo)</div>
                    <div className="text-sm text-slate-300">Życie uśpione — trwanie bez ruchu</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Głębokie tło, zerowe napięcie. Potencjał niewykorzystany. Stagnacja.
                    </div>
                  </div>
                </div>
              </div>

              {/* Poziom 4: BA */}
              <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-700/50">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">🔍</div>
                  <div>
                    <div className="font-mono text-amber-400">BA</div>
                    <div className="text-sm text-slate-300">Życie poszukujące — działanie bez oparcia</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Stan przejściowy. Może prowadzić do AB (zdrowienie) lub BB (rozpad).
                    </div>
                  </div>
                </div>
              </div>

              {/* Poziom 5: BB */}
              <div className="bg-rose-900/20 rounded-xl p-4 border border-rose-700/50">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">💥</div>
                  <div>
                    <div className="font-mono text-rose-400">BB</div>
                    <div className="text-sm text-slate-300">Życie rozpraszające się — ruch bez pola</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Entropia maksymalna. Energia bez formy. Prowadzi do anihilacji lub desperackiego szukania (→BA).
                    </div>
                  </div>
                </div>
              </div>

              {/* Graniczne stany */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                  <div className="text-center">
                    <div className="text-2xl mb-2">∅</div>
                    <div className="font-mono text-slate-500">AAA → 0</div>
                    <div className="text-xs text-slate-600">Śmierć przez niebycie</div>
                    <div className="text-xs text-slate-700 mt-1">Czysta potencja bez aktualizacji</div>
                  </div>
                </div>
                <div className="bg-red-950/50 rounded-xl p-4 border border-red-900/50">
                  <div className="text-center">
                    <div className="text-2xl mb-2">∞</div>
                    <div className="font-mono text-red-400">BBB → ∞</div>
                    <div className="text-xs text-red-300">Śmierć przez rozproszenie</div>
                    <div className="text-xs text-red-400/50 mt-1">Czyste działanie bez formy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Kliniczne przykłady */}
          <div className="mt-6 bg-slate-900 rounded-xl p-6">
            <h4 className="font-medium mb-4">Przykłady kliniczne (psyche)</h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="p-3 bg-indigo-900/20 rounded-lg">
                  <span className="font-mono text-indigo-400">AA</span>
                  <span className="text-slate-400 ml-2">→ Depresja (brak energii, wycofanie)</span>
                </div>
                <div className="p-3 bg-emerald-900/20 rounded-lg">
                  <span className="font-mono text-emerald-400">AB</span>
                  <span className="text-slate-400 ml-2">→ Zdrowe funkcjonowanie</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="p-3 bg-amber-900/20 rounded-lg">
                  <span className="font-mono text-amber-400">BA</span>
                  <span className="text-slate-400 ml-2">→ Lęk (działanie bez oparcia)</span>
                </div>
                <div className="p-3 bg-rose-900/20 rounded-lg">
                  <span className="font-mono text-rose-400">BB</span>
                  <span className="text-slate-400 ml-2">→ Mania/psychoza (ruch bez granic)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8 text-slate-600 text-sm">
        <p>Kombinatoryka przefazowywania — rozwinięcie teorii A↔B</p>
      </div>
    </div>
  );
};

export default KombinatorykaPrzefazowywania;
