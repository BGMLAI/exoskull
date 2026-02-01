import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Area } from 'recharts';

// Dane: Luka długości życia w Europie 2024
const lifeGapData = [
  { country: 'Litwa', gap: 9.8, men: 71.2, women: 81.0 },
  { country: 'Łotwa', gap: 9.5, men: 70.5, women: 80.0 },
  { country: 'Estonia', gap: 8.6, men: 74.4, women: 83.0 },
  { country: 'Polska', gap: 7.3, men: 74.9, women: 82.2 },
  { country: 'Węgry', gap: 6.5, men: 73.4, women: 79.9 },
  { country: 'Słowacja', gap: 6.4, men: 74.0, women: 80.4 },
  { country: 'Rumunia', gap: 6.3, men: 72.1, women: 78.4 },
  { country: 'Czechy', gap: 5.8, men: 76.3, women: 82.1 },
  { country: 'Niemcy', gap: 4.7, men: 78.3, women: 83.0 },
  { country: 'Francja', gap: 5.9, men: 79.5, women: 85.4 },
  { country: 'UK', gap: 3.8, men: 79.0, women: 82.8 },
  { country: 'Szwecja', gap: 3.4, men: 81.3, women: 84.7 },
  { country: 'Islandia', gap: 3.1, men: 81.7, women: 84.8 },
].sort((a, b) => b.gap - a.gap);

// Dane: Samobójstwa mężczyzn vs kobiet w Europie
const suicideData = [
  { country: 'Polska', menRate: 23.9, womenRate: 3.4, ratio: 7.0 },
  { country: 'Litwa', menRate: 36.2, womenRate: 6.8, ratio: 5.3 },
  { country: 'Węgry', menRate: 24.1, womenRate: 6.2, ratio: 3.9 },
  { country: 'Finlandia', menRate: 20.3, womenRate: 6.8, ratio: 3.0 },
  { country: 'Francja', menRate: 19.3, womenRate: 5.5, ratio: 3.5 },
  { country: 'Niemcy', menRate: 15.5, womenRate: 4.8, ratio: 3.2 },
  { country: 'Szwecja', menRate: 16.8, womenRate: 7.2, ratio: 2.3 },
  { country: 'UK', menRate: 14.1, womenRate: 4.5, ratio: 3.1 },
  { country: 'Włochy', menRate: 9.2, womenRate: 2.8, ratio: 3.3 },
  { country: 'Hiszpania', menRate: 11.3, womenRate: 3.8, ratio: 3.0 },
];

// Dane: Dekompozycja luki długości życia
const gapDecomposition = [
  { factor: 'Palenie tytoniu', contribution: 25, color: '#ef4444' },
  { factor: 'Alkohol', contribution: 18, color: '#f97316' },
  { factor: 'Wypadki/przemoc', contribution: 15, color: '#eab308' },
  { factor: 'Ryzyko zawodowe', contribution: 12, color: '#84cc16' },
  { factor: 'Unikanie lekarzy', contribution: 10, color: '#22c55e' },
  { factor: 'Narkotyki', contribution: 5, color: '#14b8a6' },
  { factor: 'Biologia (rdzeń)', contribution: 15, color: '#6366f1' },
];

// Dane: Śmiertelność zawodowa wg płci
const workDeaths = [
  { sector: 'Górnictwo', men: 98.2, women: 1.8 },
  { sector: 'Budownictwo', men: 97.5, women: 2.5 },
  { sector: 'Transport', men: 94.1, women: 5.9 },
  { sector: 'Rolnictwo', men: 89.3, women: 10.7 },
  { sector: 'Przemysł', men: 91.2, women: 8.8 },
  { sector: 'OGÓŁEM', men: 95.9, women: 4.1 },
];

// Dane: Ewolucja luki historycznie
const historicalGap = [
  { year: 1900, gap: 2.8, note: 'Wysoka śmiertelność połogowa' },
  { year: 1920, gap: 3.5, note: '' },
  { year: 1940, gap: 4.2, note: '' },
  { year: 1950, gap: 5.1, note: 'Antybiotyki, poprawa położnictwa' },
  { year: 1960, gap: 5.8, note: '' },
  { year: 1970, gap: 7.1, note: 'Szczyt epidemii palenia M' },
  { year: 1980, gap: 7.8, note: 'SZCZYT LUKI' },
  { year: 1990, gap: 6.9, note: 'Spadek palenia M' },
  { year: 2000, gap: 5.8, note: '' },
  { year: 2010, gap: 5.2, note: 'Minimum' },
  { year: 2020, gap: 5.8, note: 'COVID, opioidy' },
  { year: 2024, gap: 6.1, note: 'Wzrost' },
];

// Dane: Polska - wskaźniki nierówności
const polandIndicators = [
  { indicator: 'Luka życia (lata)', value: 7.3, max: 10, category: 'health' },
  { indicator: 'Samobójstwa M (%)', value: 86, max: 100, category: 'health' },
  { indicator: 'Wypadki śmiertelne M (%)', value: 96, max: 100, category: 'work' },
  { indicator: 'Bezdomność M (%)', value: 80, max: 100, category: 'social' },
  { indicator: 'Piecza matki (%)', value: 93, max: 100, category: 'legal' },
  { indicator: 'Luka płacowa K (%)', value: 8, max: 25, category: 'work' },
  { indicator: 'Przemoc dom. ofiary K (%)', value: 73, max: 100, category: 'social' },
];

// Dane: Porównanie obu płci - radar
const radarData = [
  { subject: 'Długość życia', men: 75, women: 82, fullMark: 90 },
  { subject: 'Zdrowe lata', men: 63, women: 64, fullMark: 75 },
  { subject: 'Bezpieczeństwo pracy', men: 4, women: 96, fullMark: 100 },
  { subject: 'Piecza nad dziećmi', men: 7, women: 93, fullMark: 100 },
  { subject: 'Wykształcenie wyższe', men: 42, women: 58, fullMark: 100 },
  { subject: 'Reprezentacja polityczna', men: 70, women: 30, fullMark: 100 },
];

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#be185d'];

export default function Dashboard() {
  const [activeChart, setActiveChart] = useState('lifeGap');
  
  const charts = [
    { id: 'lifeGap', name: 'Luka długości życia w Europie' },
    { id: 'suicide', name: 'Samobójstwa wg płci' },
    { id: 'decomposition', name: 'Dekompozycja luki' },
    { id: 'workDeaths', name: 'Śmiertelność zawodowa' },
    { id: 'historical', name: 'Ewolucja historyczna luki' },
    { id: 'poland', name: 'Polska - wskaźniki' },
    { id: 'radar', name: 'Porównanie płci - radar' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">
          Wizualizacje dla projektu "Piekło Mężczyzn"
        </h1>
        <p className="text-gray-600 text-center mb-6 text-sm">
          Dane empiryczne o nierównościach płciowych w Polsce i Europie
        </p>
        
        {/* Navigation */}
        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          {charts.map(chart => (
            <button
              key={chart.id}
              onClick={() => setActiveChart(chart.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeChart === chart.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              {chart.name}
            </button>
          ))}
        </div>

        {/* Chart Container */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          
          {/* 1. Life Gap Chart */}
          {activeChart === 'lifeGap' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Luka w długości życia między płciami (2024)</h2>
              <p className="text-gray-600 text-sm mb-4">Różnica w oczekiwanej długości życia: kobiety minus mężczyźni (w latach)</p>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={lifeGapData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 12]} unit=" lat" />
                  <YAxis dataKey="country" type="category" width={80} />
                  <Tooltip 
                    formatter={(value, name) => [`${value} lat`, name === 'gap' ? 'Luka' : name]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Bar dataKey="gap" fill="#2563eb" radius={[0, 4, 4, 0]}>
                    {lifeGapData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.country === 'Polska' ? '#dc2626' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-3 bg-red-50 rounded-lg">
                <p className="text-sm text-red-800">
                  <strong>Polska:</strong> Luka 7,3 roku — 4. najwyższa w UE. Mężczyźni żyją średnio 74,9 lat, kobiety 82,2 lat.
                </p>
              </div>
            </div>
          )}

          {/* 2. Suicide Chart */}
          {activeChart === 'suicide' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Wskaźniki samobójstw według płci (na 100 000)</h2>
              <p className="text-gray-600 text-sm mb-4">Polska ma najwyższy stosunek M:K w Europie (7:1)</p>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={suicideData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="country" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="menRate" name="Mężczyźni" fill="#2563eb" />
                  <Bar dataKey="womenRate" name="Kobiety" fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">86%</p>
                  <p className="text-sm text-blue-600">samobójstw w Polsce popełniają mężczyźni</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-700">7:1</p>
                  <p className="text-sm text-red-600">stosunek M:K — najwyższy w UE</p>
                </div>
              </div>
            </div>
          )}

          {/* 3. Decomposition Pie */}
          {activeChart === 'decomposition' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Dekompozycja luki długości życia</h2>
              <p className="text-gray-600 text-sm mb-4">Udział poszczególnych czynników w 7-8 letniej różnicy (źródło: Luy & Wegner-Siegmundt 2015)</p>
              <div className="flex flex-col md:flex-row items-center">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={gapDecomposition}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      dataKey="contribution"
                      label={({ factor, contribution }) => `${factor}: ${contribution}%`}
                    >
                      {gapDecomposition.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">85%</p>
                  <p className="text-sm text-green-600">luki wynika z czynników behawioralnych/społecznych (modyfikowalnych)</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-700">~15%</p>
                  <p className="text-sm text-purple-600">to "rdzeń biologiczny" (niemodyfikowalny)</p>
                </div>
              </div>
            </div>
          )}

          {/* 4. Work Deaths */}
          {activeChart === 'workDeaths' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Śmiertelność zawodowa według płci w Polsce</h2>
              <p className="text-gray-600 text-sm mb-4">Odsetek ofiar śmiertelnych wypadków przy pracy według sektorów (GUS 2023)</p>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={workDeaths} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis dataKey="sector" type="category" width={100} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Bar dataKey="men" name="Mężczyźni" stackId="a" fill="#2563eb" />
                  <Bar dataKey="women" name="Kobiety" stackId="a" fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>95,9%</strong> ofiar śmiertelnych wypadków przy pracy to mężczyźni. W górnictwie — 98,2%.
                </p>
              </div>
            </div>
          )}

          {/* 5. Historical Evolution */}
          {activeChart === 'historical' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Ewolucja luki długości życia (1900-2024)</h2>
              <p className="text-gray-600 text-sm mb-4">Różnica K-M w oczekiwanej długości życia w krajach rozwiniętych</p>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={historicalGap}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis domain={[0, 10]} unit=" lat" />
                  <Tooltip 
                    formatter={(value, name) => [`${value} lat`, 'Luka']}
                    labelFormatter={(label) => `Rok ${label}`}
                  />
                  <Area type="monotone" dataKey="gap" fill="#bfdbfe" stroke="#2563eb" />
                  <Line type="monotone" dataKey="gap" stroke="#2563eb" strokeWidth={3} dot={{ fill: '#2563eb', r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-gray-100 rounded">
                  <p className="text-sm font-semibold">1900</p>
                  <p className="text-xs text-gray-600">2,8 lat (wysoka śmiertelność połogowa)</p>
                </div>
                <div className="p-2 bg-red-100 rounded">
                  <p className="text-sm font-semibold">1980</p>
                  <p className="text-xs text-red-600">7,8 lat — SZCZYT</p>
                </div>
                <div className="p-2 bg-orange-100 rounded">
                  <p className="text-sm font-semibold">2024</p>
                  <p className="text-xs text-orange-600">6,1 lat (ponowny wzrost)</p>
                </div>
              </div>
            </div>
          )}

          {/* 6. Poland Indicators */}
          {activeChart === 'poland' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Polska — kluczowe wskaźniki nierówności 2024</h2>
              <p className="text-gray-600 text-sm mb-4">Porównanie wskaźników dotykających obie płcie</p>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={polandIndicators} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="indicator" type="category" width={180} />
                  <Tooltip formatter={(value) => `${value}`} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {polandIndicators.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.category === 'health' ? '#dc2626' : 
                              entry.category === 'work' ? '#2563eb' : 
                              entry.category === 'legal' ? '#9333ea' : '#16a34a'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 flex gap-4 justify-center text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-600 rounded"></span> Zdrowie</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-600 rounded"></span> Praca</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-600 rounded"></span> Prawo</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-600 rounded"></span> Społeczne</span>
              </div>
            </div>
          )}

          {/* 7. Radar Comparison */}
          {activeChart === 'radar' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Porównanie sytuacji obu płci — profil radarowy</h2>
              <p className="text-gray-600 text-sm mb-4">Wybrane wskaźniki dla Polski (wyższe = lepsze/więcej)</p>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar name="Mężczyźni" dataKey="men" stroke="#2563eb" fill="#2563eb" fillOpacity={0.5} />
                  <Radar name="Kobiety" dataKey="women" stroke="#ec4899" fill="#ec4899" fillOpacity={0.5} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm">
                <p><strong>Interpretacja:</strong> Każda płeć doświadcza przewag w innych obszarach. Kobiety — dłuższe życie, wykształcenie, bezpieczeństwo pracy. Mężczyźni — reprezentacja polityczna. Obciążenia są komplementarne, nie hierarchiczne.</p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Źródła: Eurostat 2024, GUS 2024, WHO 2024, IHME GBD 2021</p>
          <p className="mt-1">Projekt "Piekło Mężczyzn" — Synteza akademicka</p>
        </div>
      </div>
    </div>
  );
}
