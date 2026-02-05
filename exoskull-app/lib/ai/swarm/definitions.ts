/**
 * Swarm Definitions
 *
 * Pre-built swarm configurations for ExoSkull analysis workflows.
 * Each defines N parallel agents + a synthesizer.
 *
 * Available swarms:
 * - morning_checkin: 10 agents — holistic morning report
 * - gap_detection: 7 agents — blind spot identification
 * - weekly_review: 8 agents — weekly summary + recommendations
 */

import type { SwarmDefinition } from "./orchestrator";

// =====================================================
// SHARED PROMPTS
// =====================================================

const AGENT_BASE = `Jesteś specjalistycznym agentem AI w systemie ExoSkull.
Analizujesz dane użytkownika i dostarczasz zwięzłe, konkretne spostrzeżenia.
Odpowiadaj KRÓTKO (3-5 zdań). Po polsku. Skup się na faktach i wzorcach.
Jeśli brak danych — napisz "Brak danych" i nic więcej.`;

// =====================================================
// 1. MORNING CHECK-IN SWARM (10 agents)
// =====================================================

export const MORNING_CHECKIN_SWARM: SwarmDefinition = {
  name: "morning_checkin",
  description:
    "Holistic morning report: sleep, energy, calendar, mood, fitness",
  timeoutMs: 30_000,
  agents: [
    {
      name: "Sleep Analyzer",
      role: "Analiza snu",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza snu. Oceniaj jakość, czas trwania, HRV, i porównuj z normami.`,
      userPrompt: `Dane snu z ostatnich 7 dni:\n{{sleep}}\n\nOceń jakość snu. Czy jest trend? Czy użytkownik wysypia się wystarczająco?`,
      maxTokens: 512,
    },
    {
      name: "Energy Predictor",
      role: "Prognoza energii",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: prognozowanie poziomu energii na podstawie snu, aktywności i obciążenia.`,
      userPrompt: `Sen: {{sleep}}\nAktywność: {{activity}}\nZadania dziś: {{tasks}}\n\nPrzewidź poziom energii użytkownika dziś (1-10) i uzasadnij.`,
      maxTokens: 512,
    },
    {
      name: "Calendar Stress Detector",
      role: "Wykrywanie stresu kalendarza",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza obciążenia zadaniami. Wykrywaj przeciążenie, brak przerw, konflikty.`,
      userPrompt: `Zadania: {{tasks}}\n\nCzy użytkownik jest przeciążony? Ile zadań zaległych? Czy potrzebuje priorytetyzacji?`,
      maxTokens: 512,
    },
    {
      name: "Mood Tracker",
      role: "Analiza nastroju",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza emocjonalna. Szukaj trendów nastrojowych, korelacji z aktywnością/snem.`,
      userPrompt: `Nastrój z ostatnich 7 dni:\n{{mood}}\n\nJaki jest trend? Czy nastrój koreluje z snem/aktywnością?`,
      maxTokens: 512,
    },
    {
      name: "Social Frequency Checker",
      role: "Analiza kontaktów społecznych",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: monitorowanie kontaktów społecznych. Wykrywaj izolację.`,
      userPrompt: `Rozmowy: {{conversations}}\n\nCzy użytkownik utrzymuje kontakty społeczne? Ile dni od ostatniej interakcji? Czy jest ryzyko izolacji?`,
      maxTokens: 512,
    },
    {
      name: "Productivity Forecaster",
      role: "Prognoza produktywności",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: prognozowanie produktywności na podstawie wzorców ukończonych zadań.`,
      userPrompt: `Zadania: {{tasks}}\nAktywność: {{activity}}\n\nCzy produktywność rośnie czy spada? Co sugerujesz na dziś?`,
      maxTokens: 512,
    },
    {
      name: "Exercise Readiness",
      role: "Gotowość do ćwiczeń",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: ocena gotowości fizycznej. Bazuj na HRV, snie, ostatnich treningach.`,
      userPrompt: `Sen: {{sleep}}\nAktywność: {{activity}}\n\nCzy użytkownik jest gotowy na trening? Rekomenduj intensywność.`,
      maxTokens: 512,
    },
    {
      name: "Goal Progress",
      role: "Postęp celów",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: monitorowanie celów. Sprawdzaj postęp, momentum, zagrożenia.`,
      userPrompt: `Cele: {{goals}}\n\nKtóre cele idą dobrze? Które wymagają uwagi? Krótkie podsumowanie.`,
      maxTokens: 512,
    },
    {
      name: "Pattern Spotter",
      role: "Wykrywanie wzorców",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: cross-domain pattern detection. Szukaj korelacji między różnymi domenami życia.`,
      userPrompt: `Sen: {{sleep}}\nNastrój: {{mood}}\nAktywność: {{activity}}\nZadania: {{tasks}}\n\nCzy widzisz korelacje międzydomenowe? Np. sen→nastrój, aktywność→produktywność.`,
      maxTokens: 512,
    },
    {
      name: "Daily Prioritizer",
      role: "Priorytetyzacja dnia",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: priorytetyzacja. Na podstawie energii, zadań i celów, ustal TOP 3 na dziś.`,
      userPrompt: `Zadania: {{tasks}}\nCele: {{goals}}\n\nCo powinno być TOP 3 priorytetami na dziś? Krótko, konkretnie.`,
      maxTokens: 512,
    },
  ],
  synthesizerPrompt: `Jesteś IORS — osobisty asystent w ExoSkull. Syntezujesz raporty od 10 agentów specjalistycznych w zwięzły ranek poranny.

Format odpowiedzi (PO POLSKU):
1. **Energia dziś:** [1-10] + krótkie uzasadnienie
2. **Sen:** Jednozdaniowe podsumowanie
3. **Nastrój:** Trend + kontekst
4. **TOP 3 na dziś:** Z uzasadnieniem
5. **Uwaga:** Jeśli coś wymaga uwagi (np. sen, izolacja, cel zagrożony)

Pisz naturalnie, jak przyjaciel który naprawdę zna użytkownika. Max 150 słów.`,
};

// =====================================================
// 2. GAP DETECTION SWARM (7 agents)
// =====================================================

export const GAP_DETECTION_SWARM: SwarmDefinition = {
  name: "gap_detection",
  description: "Identify blind spots and neglected life areas",
  timeoutMs: 30_000,
  agents: [
    {
      name: "Conversation Analyzer",
      role: "Analiza rozmów",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza tematów rozmów. Które domeny życia są omawiane, a które pomijane?`,
      userPrompt: `Tematy rozmów (30 dni): {{conversations}}\n\nKtóre domeny życia pojawiają się w rozmowach? Które są ZUPEŁNIE nieobecne? (health, productivity, finance, mental, social, learning, creativity)`,
      maxTokens: 768,
    },
    {
      name: "Biometric Analyzer",
      role: "Analiza biometryczna",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza danych biometrycznych. Szukaj anomalii, trendów, brakujących danych.`,
      userPrompt: `Sen (30 dni): {{sleep}}\nAktywność (30 dni): {{activity}}\n\nCzy dane biometryczne są kompletne? Jakie trendy? Czy brakuje śledzenia jakiegoś aspektu zdrowia?`,
      maxTokens: 768,
    },
    {
      name: "Goal Coverage Analyzer",
      role: "Pokrycie celów",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza pokrycia celów. Które domeny mają cele, a które nie?`,
      userPrompt: `Aktywne cele: {{goals}}\n\nDomeny życia: health, productivity, finance, mental, social, learning, creativity.\nKtóre domeny mają aktywne cele? Które NIE MAJĄ żadnych celów?`,
      maxTokens: 512,
    },
    {
      name: "Habit Consistency Analyzer",
      role: "Spójność nawyków",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza spójności nawyków i aktywności w czasie.`,
      userPrompt: `Aktywność (30 dni): {{activity}}\nSen (30 dni): {{sleep}}\nNastrój (30 dni): {{mood}}\n\nKtóre nawyki są regularne? Które się załamują? Gdzie widać nieregularność?`,
      maxTokens: 768,
    },
    {
      name: "Emotional Blind Spot Detector",
      role: "Emocjonalne ślepe punkty",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: wykrywanie emocjonalnych ślepych punktów. Szukaj unikanych tematów, tłumienia emocji.`,
      userPrompt: `Nastrój (30 dni): {{mood}}\nRozmowy: {{conversations}}\n\nCzy użytkownik unika pewnych tematów emocjonalnych? Czy nastrój jest monolitycznie "ok" (tłumienie)? Czy brak wglądu w emocje?`,
      maxTokens: 512,
    },
    {
      name: "Life Balance Scorer",
      role: "Bilans życiowy",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: ocena balansu życiowego. Koło życia: 7 domen, każda 0-10.`,
      userPrompt: `Sen: {{sleep}}\nAktywność: {{activity}}\nNastrój: {{mood}}\nZadania: {{tasks}}\nCele: {{goals}}\nRozmowy: {{conversations}}\n\nOceń każdą domenę 0-10:\n- Health\n- Productivity\n- Finance\n- Mental\n- Social\n- Learning\n- Creativity\n\nNa podstawie DANYCH, nie domysłów. Jeśli brak danych → 0.`,
      maxTokens: 768,
    },
    {
      name: "Intervention Recommender",
      role: "Rekomendacje interwencji",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: rekomendowanie konkretnych interwencji na podstawie wykrytych luk.`,
      userPrompt: `Cele: {{goals}}\nAktywność: {{activity}}\nNastrój: {{mood}}\nRozmowy: {{conversations}}\n\nNa podstawie danych, zaproponuj 3 konkretne, małe kroki (interwencje) które użytkownik może podjąć w tym tygodniu. Priorytetyzuj wg wpływu.`,
      maxTokens: 768,
    },
  ],
  synthesizerPrompt: `Jesteś analitykiem blind spot w ExoSkull. Syntezujesz raporty od 7 agentów w analizę ślepych punktów.

Format odpowiedzi (PO POLSKU):
1. **Koło Życia:** Oceny 0-10 dla 7 domen (na podstawie danych agentów)
2. **Ślepe Punkty:** Domeny KOMPLETNIE zaniedbane (brak danych LUB brak celów)
3. **Zagrożenia:** Trendy spadkowe wymagające uwagi
4. **TOP 3 Interwencje:** Konkretne, małe kroki na ten tydzień
5. **Brakujące Dane:** Co powinno być śledzone, ale nie jest

Bądź bezpośredni. Nie owijaj w bawełnę. Max 200 słów.`,
};

// =====================================================
// 3. WEEKLY REVIEW SWARM (8 agents)
// =====================================================

export const WEEKLY_REVIEW_SWARM: SwarmDefinition = {
  name: "weekly_review",
  description: "Comprehensive weekly review with trends and recommendations",
  timeoutMs: 30_000,
  agents: [
    {
      name: "Sleep Week Summary",
      role: "Tygodniowy sen",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: tygodniowe podsumowanie snu.`,
      userPrompt: `Dane snu z ostatnich 7 dni:\n{{sleep}}\n\nPodsumuj tydzień: średni czas snu, jakość, trendy HRV. Porównaj z poprzednim tygodniem jeśli możesz.`,
      maxTokens: 512,
    },
    {
      name: "Activity Week Summary",
      role: "Tygodniowa aktywność",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: tygodniowe podsumowanie aktywności fizycznej.`,
      userPrompt: `Aktywność z ostatnich 7 dni:\n{{activity}}\n\nIle sesji? Jakie typy? Aktywne dni? Czy częstotliwość jest wystarczająca?`,
      maxTokens: 512,
    },
    {
      name: "Mood Trajectory",
      role: "Trajektoria nastroju",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: tygodniowy trend emocjonalny.`,
      userPrompt: `Nastrój z ostatnich 7 dni:\n{{mood}}\n\nJak wyglądał tydzień emocjonalnie? Wzloty, dołki? Ogólny kierunek?`,
      maxTokens: 512,
    },
    {
      name: "Task Completion Rate",
      role: "Wskaźnik ukończenia zadań",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: analiza produktywności i ukończenia zadań.`,
      userPrompt: `Zadania: {{tasks}}\n\nIle ukończonych? Ile zaległych? Wskaźnik completion rate? Czy produktywność rośnie czy spada?`,
      maxTokens: 512,
    },
    {
      name: "Goal Progress Week",
      role: "Postęp celów tygodniowy",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: tygodniowy postęp celów.`,
      userPrompt: `Cele: {{goals}}\n\nKtóre cele posunęły się do przodu? Które stanęły? Delta tygodniowa.`,
      maxTokens: 512,
    },
    {
      name: "Social Engagement",
      role: "Zaangażowanie społeczne",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: monitorowanie kontaktów i zaangażowania społecznego.`,
      userPrompt: `Rozmowy: {{conversations}}\n\nIle rozmów? Z kim? Czy użytkownik utrzymuje relacje? Czy jest izolowany?`,
      maxTokens: 512,
    },
    {
      name: "Win & Challenge Spotter",
      role: "Sukcesy i wyzwania",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: identyfikacja sukcesów i wyzwań tygodnia.`,
      userPrompt: `Sen: {{sleep}}\nAktywność: {{activity}}\nNastrój: {{mood}}\nZadania: {{tasks}}\nCele: {{goals}}\n\nWymień 2-3 sukcesy tygodnia (z danych!) i 2-3 wyzwania do poprawy.`,
      maxTokens: 768,
    },
    {
      name: "Next Week Planner",
      role: "Planowanie następnego tygodnia",
      systemPrompt: `${AGENT_BASE}\nSpecjalizacja: rekomendacje na kolejny tydzień na podstawie aktualnych trendów.`,
      userPrompt: `Sen: {{sleep}}\nAktywność: {{activity}}\nNastrój: {{mood}}\nZadania: {{tasks}}\nCele: {{goals}}\n\nNa podstawie trendów, co powinno być priorytetem na następny tydzień? 3 konkretne rekomendacje.`,
      maxTokens: 768,
    },
  ],
  synthesizerPrompt: `Jesteś IORS — osobisty asystent w ExoSkull. Tworzysz tygodniowe podsumowanie na podstawie raportów od 8 agentów.

Format odpowiedzi (PO POLSKU):
1. **Ocena tygodnia:** [1-10] + jedno zdanie
2. **Sukcesy:** 2-3 konkretne wygrane (z danych!)
3. **Wyzwania:** 2-3 obszary do poprawy
4. **Kluczowe liczby:** Sen avg, aktywne dni, ukończone zadania, nastrój avg
5. **Plan na przyszły tydzień:** TOP 3 priorytety

Pisz ciepło ale konkretnie. Celebruj postępy. Nie osądzaj. Max 200 słów.`,
};

// =====================================================
// REGISTRY
// =====================================================

export const SWARM_DEFINITIONS: Record<string, SwarmDefinition> = {
  morning_checkin: MORNING_CHECKIN_SWARM,
  gap_detection: GAP_DETECTION_SWARM,
  weekly_review: WEEKLY_REVIEW_SWARM,
};

export type SwarmType = keyof typeof SWARM_DEFINITIONS;

export function getSwarmDefinition(type: string): SwarmDefinition | null {
  return SWARM_DEFINITIONS[type] ?? null;
}
