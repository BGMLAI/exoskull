# 55.20 ADEKWATNOŚĆ — FORMALNA DEFINICJA

**Status:** Proponowana sekcja do włączenia do TEORIA_KOMPLETNA v3.7

---

## 55.20.1 Problem: Czym jest "adekwatność"?

W teorii τ używamy pojęcia "adekwatność" jako kryterium zdrowia:

> *"Optimum życia = złożoność W HARMONII z kontekstem"*

Ale czym dokładnie jest ta "harmonia"? Jak ją mierzyć?

---

## 55.20.2 Definicja Formalna

**Definicja 5 (Adekwatność):**

Adekwatność α systemu S w środowisku E to stosunek między:
- **Złożonością zasobów** systemu (V = variety)
- **Złożonością wyzwań** środowiska (D = disturbance)

```
α(S,E) = V(S) / D(E)

gdzie:
- V(S) = miara różnorodności stanów dostępnych dla systemu
- D(E) = miara różnorodności perturbacji ze środowiska
```

**Źródło:** Ashby's Law of Requisite Variety (1956):
> "Only variety can absorb variety"

---

## 55.20.3 Trzy Stany Adekwatności

```
                    NIEDOBÓR                OPTIMUM               NADMIAR
                    (α < 1)                 (α ≈ 1)               (α > 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Zasoby:             za mało                 dopasowane            za dużo
Wyzwania:           za dużo                 dopasowane            za mało
τ:                  wysokie (stres)         umiarkowane           niskie (nuda)
Stan:               PRZECIĄŻENIE            FLOW                  STAGNACJA
Emocja:             lęk, panika             spokój, misja         nuda, pustka
Kierunek:           BA (szukanie tła)       AB (eksploracja)      AA (brak ruchu)
```

---

## 55.20.4 Metryka Adekwatności

**Operacjonalizacja V(S):**

```
V(S) = |{stany które system może przyjąć}|

Dla człowieka:
- Fizyczne: ile ruchów ciała?
- Poznawcze: ile koncepcji może operować?
- Emocjonalne: ile stanów emocjonalnych rozpoznaje?
- Społeczne: ile ról może grać?
```

**Operacjonalizacja D(E):**

```
D(E) = |{perturbacje które środowisko może wywołać}|

Dla człowieka:
- Fizyczne: zmienność temperatury, głód, choroba...
- Poznawcze: nowe informacje, sprzeczności, problemy...
- Emocjonalne: straty, konflikty, odrzucenie...
- Społeczne: zmiana statusu, nowe relacje...
```

---

## 55.20.5 Adekwatność Dynamiczna

Środowisko zmienia się w czasie, więc adekwatność też:

```
α(t) = V(S,t) / D(E,t)

ZDROWIE = ∂V/∂D > 0

(zasoby rosną W ODPOWIEDZI na wyzwania)
```

**Trzy reakcje na wzrost D(E):**

| Reakcja | V(S) | α | Efekt |
|---------|------|---|-------|
| **Adaptacja** | V rośnie | α → 1 | Zdrowie, rozwój |
| **Załamanie** | V stałe lub maleje | α → 0 | Trauma, choroba |
| **Unikanie** | D maleje (ucieczka) | α → ∞ | Tymczasowa ulga, stagnacja |

---

## 55.20.6 Adekwatność a τ

**Związek:**

```
τ = f(1/α)

gdzie f() jest funkcją monotonicznie malejącą

τ wysokie ⟺ α niskie (niedobór zasobów = napięcie)
τ niskie  ⟺ α wysokie (nadmiar zasobów = brak napięcia)
```

**Optimum:**

```
τ_opt ⟺ α ≈ 1

Nie za mało napięcia (nuda), nie za dużo (panika).
```

---

## 55.20.7 Adekwatność Specyficzna dla Domeny

Adekwatność nie jest globalna — jest specyficzna dla domeny:

| Domena | V_domena | D_domena | α_domena |
|--------|----------|----------|----------|
| **Fizyczna** | sprawność ciała | wymagania fizyczne | α_fiz |
| **Poznawcza** | umiejętności myślenia | problemy do rozwiązania | α_cog |
| **Emocjonalna** | regulacja emocji | stresory emocjonalne | α_emo |
| **Społeczna** | umiejętności społeczne | wyzwania relacyjne | α_soc |
| **Duchowa** | sens, wartości | pytania egzystencjalne | α_spi |

**Całkowita adekwatność:**

```
α_total = Σ wᵢ · αᵢ

gdzie wᵢ = waga domeny i (zależy od kontekstu)
```

---

## 55.20.8 Pomiar Adekwatności

**Proxy behawioralne:**

| Wskaźnik | α wysokie (nadmiar) | α niskie (niedobór) |
|----------|---------------------|---------------------|
| **Eksploracja** | wysoka (szukanie wyzwań) | niska (unikanie) |
| **Proaktywność** | wysoka | niska (reaktywność) |
| **Tolerancja niepewności** | wysoka | niska |
| **Ciekawość** | wysoka | niska (lęk) |
| **Otwartość na feedback** | wysoka | niska (defensywność) |

**Proxy fizjologiczne:**

| Wskaźnik | α wysokie | α niskie |
|----------|-----------|----------|
| **HRV** (heart rate variability) | wysoka | niska |
| **Kortyzol** | umiarkowany | chronically elevated |
| **Allostatic load** | niski | wysoki |
| **Inflammatory markers** | niskie | podwyższone |

---

## 55.20.9 Adekwatność w Patologiach

| Patologia | Problem z α | Mechanizm |
|-----------|-------------|-----------|
| **Depresja** | α → ∞ (nadmiar) | Wycofanie = redukcja D, V nie rośnie |
| **Mania** | α → 0 (niedobór) | Nadmierna ekspozycja na D, V nie nadąża |
| **Lęk uogólniony** | α < 1 chroniczne | Chroniczny niedobór V względem perceived D |
| **Narcyzm** | α_perceived ≠ α_real | Inflacja V, deflacja D (grandiozja) |
| **Trauma** | α zamrożone | V zamrożone w momencie traumy |

---

## 55.20.10 Adekwatność w Relacjach

**Manipulacja jako obniżanie α drugiego:**

```
KONTROLA = obniżanie V drugiego LUB zwiększanie perceived D

Efekt: α_victim → 0 (chronic insufficiency)
```

**Metody obniżania V:**
- Izolacja (ograniczenie dostępu do zasobów zewnętrznych)
- Gaslighting (ograniczenie zaufania do własnej percepcji)
- Krytyka (ograniczenie poczucia kompetencji)
- Unpredictability (ograniczenie zdolności do planowania)

**Metody zwiększania perceived D:**
- Groźby (zwiększenie postrzeganego zagrożenia)
- Moving goalposts (zwiększenie wymagań)
- Emotional volatility (zwiększenie nieprzewidywalności)

---

## 55.20.11 Terapia jako Przywracanie Adekwatności

**Cel terapii:**

```
α_before < 1 → α_after ≈ 1
```

**Dwie drogi:**

1. **Zwiększanie V** (budowanie zasobów):
   - Psychoedukacja (poznawcze)
   - Trening regulacji emocji (emocjonalne)
   - Budowanie sieci wsparcia (społeczne)
   - Terapia sensorymotoryczna (fizyczne)

2. **Redukcja perceived D** (zmiana percepcji wyzwań):
   - Reframing poznawczy
   - Ekspozycja gradualna
   - Mindfulness (redukcja ruminacji)

---

## 55.20.12 Wzór Końcowy

```
ZDROWIE = α ≈ 1 ∧ dα/dt → 0 (stabilna adekwatność)

ROZWÓJ = α ≈ 1 ∧ V↑ ∧ D↑ (rosnąca adekwatność przy rosnących obu)

STAGNACJA = α > 1 ∧ D↓ (nadmiar przez unikanie)

ZAŁAMANIE = α < 1 ∧ V↓ (niedobór pogłębiający się)
```

---

**Następny krok:** Testowalne Predykcje (sekcja 55.21)

---

*Sekcja napisana: 27 stycznia 2026*
*Status: DRAFT - wymaga weryfikacji empirycznej*
