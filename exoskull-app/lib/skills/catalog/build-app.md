---
name: build-app
description: Build a complete custom application for the user
tools_used:
  - build_app
  - list_apps
  - app_log_data
  - manage_canvas
trigger: User needs to track something, manage data, or automate a process
cost: ~$0.05-0.15 per build (Sonnet 4.5)
---

# Build App Skill

## When to Use

- User explicitly asks to build/create/make an app or tracker
- You detect a repeated pattern that could be automated
- User is tracking something manually (in notes, spreadsheets, etc.)
- Gap detection finds an area with no tracking

## Process

1. **Understand the Need**
   - What data needs to be tracked?
   - What columns/fields are needed?
   - What views would be useful? (table, chart, summary)
   - Any automations? (reminders, calculations, alerts)

2. **Design the Schema**
   - Keep it simple: 3-8 columns max
   - Always include: timestamp, value fields, notes
   - Types: text, number, boolean, date, select
   - Think about what the user will want to filter/sort by

3. **Build It**

   ```
   build_app({
     name: "descriptive-name",
     description: "What this app does",
     columns: [
       { name: "column_name", type: "text|number|boolean|date|select", required: true/false }
     ]
   })
   ```

4. **Add to Dashboard**

   ```
   manage_canvas({ action: "add", widget_type: "app:slug-name" })
   ```

5. **Seed Initial Data** (if applicable)

   ```
   app_log_data({ app_slug: "slug-name", data: { ... } })
   ```

6. **Confirm to User**
   - "Zbudowalem [name]. Mozesz go znalezc na dashboardzie."
   - Show what it tracks and how to use it

## Examples

### Sleep Tracker

```
build_app({
  name: "sleep-tracker",
  description: "Sledzenie jakosci snu",
  columns: [
    { name: "date", type: "date", required: true },
    { name: "hours", type: "number", required: true },
    { name: "quality", type: "select", options: ["swietny", "dobry", "sredni", "zly"] },
    { name: "notes", type: "text" }
  ]
})
```

### Expense Tracker

```
build_app({
  name: "expense-tracker",
  description: "Sledzenie wydatkow",
  columns: [
    { name: "date", type: "date", required: true },
    { name: "amount", type: "number", required: true },
    { name: "category", type: "select", options: ["jedzenie", "transport", "rozrywka", "rachunki", "inne"] },
    { name: "description", type: "text" }
  ]
})
```

## Edge Cases

- If app with same name exists → append number (e.g., "sleep-tracker-2")
- If user wants complex logic → suggest Composio/API integration instead
- Max 3 retries on build failure
- If table creation fails → check column type whitelist
