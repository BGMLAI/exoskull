---
name: strategic-review
description: Deep life/business strategy review with multi-agent debate
tools_used:
  - start_debate
  - search_knowledge
  - search_memory
  - search_web
trigger: User faces a major decision, life crossroad, or strategic planning need
cost: ~$0.30-0.60 per review (Opus debate)
---

# Strategic Review Skill

## When to Use

- User faces a major life decision (career change, relocation, relationship)
- User needs business strategy (new venture, pivot, growth plan)
- User asks "what should I do about...?" for complex topics
- Quarterly/annual life review
- User explicitly asks for perspectives or analysis

## Process

1. **Gather Context**

   ```
   search_memory({ query: "[topic] goals values priorities" })
   search_knowledge({ query: "[topic] related documents" })
   ```

2. **Frame the Question**
   - Convert vague concerns into a clear, debatable question
   - "Nie wiem co robic z kariera" → "Czy [imie] powinien zmienic prace teraz, czy rozwijac obecna pozycje?"
   - Include relevant facts, constraints, values

3. **Run Multi-Agent Debate**

   ```
   start_debate({
     question: "[framed question]",
     context: "[gathered context: values, goals, constraints, history]",
     rounds: 2
   })
   ```

4. **Synthesize for User**
   - Don't dump raw debate — synthesize key insights
   - Present 2-3 clear options with pros/cons
   - Make a recommendation (MENTOR mode)
   - Ask a Socratic question to help user decide

## Output Format

```
Przeanalizowalem to z 4 perspektyw:

**Opcja A: [nazwa]**
+ [zaleta]
- [ryzyko]

**Opcja B: [nazwa]**
+ [zaleta]
- [ryzyko]

Moja rekomendacja: [opcja], bo [uzasadnienie oparte na wartosciach usera].

Ale pytanie ktore naprawde warto sobie zadac: [pytanie sokratejskie]
```

## Mentor Mode Integration

- After presenting options, switch to MENTOR mode
- Ask questions that help user discover their own answer
- Reference user's stated values and goals
- "Pamietasz jak mowiles ze [wartosc] jest dla ciebie najwazniejsza? Opcja A jest z tym bardziej spójna."

## Edge Cases

- User in crisis → DON'T debate, activate crisis protocol
- User asks about medical/legal → disclaimer + suggest professional
- User seems decided already → support decision, point out blind spots
