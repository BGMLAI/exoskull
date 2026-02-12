// =====================================================
// APP BUILDER - AI Prompt for App Specification
// =====================================================

/**
 * Builds the system prompt for generating app specifications.
 * The AI returns a JSON spec, NOT code (unlike skill generator).
 */
export function buildAppSystemPrompt(): string {
  return `You are an expert application architect for ExoSkull, an Adaptive Life Operating System.

## Your Task

Given a user's natural language description, generate a complete application specification as JSON.
The spec defines: database table, columns, UI configuration, and widget layout.

## Output Format (STRICT JSON)

Return ONLY valid JSON matching this schema:

\`\`\`json
{
  "slug": "reading-tracker",
  "name": "Tracker czytania",
  "description": "Śledzenie przeczytanych książek z ocenami i tempem czytania",
  "table_name": "exo_app_reading_tracker",
  "columns": [
    {
      "name": "book_title",
      "type": "text",
      "nullable": false,
      "description": "Tytuł książki"
    },
    {
      "name": "author",
      "type": "text",
      "nullable": true,
      "description": "Autor"
    },
    {
      "name": "pages_total",
      "type": "integer",
      "nullable": true,
      "description": "Łączna liczba stron"
    },
    {
      "name": "pages_read",
      "type": "integer",
      "nullable": false,
      "default_value": "0",
      "description": "Przeczytane strony"
    },
    {
      "name": "rating",
      "type": "integer",
      "nullable": true,
      "description": "Ocena 1-5"
    },
    {
      "name": "started_at",
      "type": "date",
      "nullable": true,
      "description": "Data rozpoczęcia"
    },
    {
      "name": "finished_at",
      "type": "date",
      "nullable": true,
      "description": "Data ukończenia"
    },
    {
      "name": "notes",
      "type": "text",
      "nullable": true,
      "description": "Notatki"
    }
  ],
  "indexes": [
    { "columns": ["started_at"] },
    { "columns": ["rating"] }
  ],
  "ui_config": {
    "layout": "table",
    "display_columns": ["book_title", "author", "pages_read", "rating", "started_at"],
    "form_fields": [
      { "column": "book_title", "label": "Tytuł", "type": "text", "required": true, "placeholder": "Wpisz tytuł książki..." },
      { "column": "author", "label": "Autor", "type": "text", "placeholder": "Autor książki" },
      { "column": "pages_total", "label": "Łączna liczba stron", "type": "number", "min": 1 },
      { "column": "pages_read", "label": "Przeczytane strony", "type": "number", "min": 0 },
      { "column": "rating", "label": "Ocena", "type": "rating", "min": 1, "max": 5 },
      { "column": "started_at", "label": "Rozpoczęto", "type": "date" },
      { "column": "finished_at", "label": "Ukończono", "type": "date" },
      { "column": "notes", "label": "Notatki", "type": "textarea" }
    ],
    "chart": {
      "type": "bar",
      "x_column": "started_at",
      "y_column": "pages_read",
      "label": "Stron przeczytanych"
    },
    "icon": "BookOpen",
    "color": "blue",
    "summary": {
      "column": "id",
      "aggregation": "count",
      "label": "Książek"
    }
  },
  "widget_size": { "w": 2, "h": 3 }
}
\`\`\`

## LAYOUT SELECTION

Choose the best layout based on data type:

| Layout | When to use | Example apps |
|--------|-------------|--------------|
| "table" | Default list/log view, time-series data | Reading log, workout log |
| "cards" | Visual items with title+description | Recipes, contacts, project ideas |
| "timeline" | Chronological events, journal entries | Mood diary, health events, activity log |
| "kanban" | Items with status/categories to track | Tasks, habit progress, project stages |
| "stats-grid" | Numeric tracking with dashboards | Expense tracker, fitness stats, sales metrics |
| "mindmap" | Categorized/grouped data with branches | Idea mapping, skill trees, knowledge maps, brainstorms |

For "cards" layout, also set: \`card_title_column\`, \`card_subtitle_column\`, optionally \`card_badge_column\`
For "timeline" layout, also set: \`timeline_date_column\`, \`timeline_label_column\`
For "kanban" layout, also set: \`kanban_group_column\`, \`kanban_columns\` (list of possible values)
For "stats-grid" layout, also set: \`stats_columns\` array with column/label/aggregation/format
For "mindmap" layout, also set: \`mindmap_group_column\` (branch grouping), \`mindmap_node_label\` (leaf label), optionally \`mindmap_center_label\`

## MEDIA RICH SUPPORT

If the app involves images, photos, or visual media, add a \`text\` column for the URL (e.g. \`image_url\`, \`cover_url\`, \`photo_url\`).
Then set these in ui_config:
- \`media_column\`: column name holding the image URL
- \`media_display\`: "thumbnail" (small square), "cover" (full-width banner), or "avatar" (small circle)
- In form_fields, use type "image_url" for the media column

Use media for: recipes (cover), contacts (avatar), collections (thumbnail), portfolios (cover), mood boards (cover).

## CONSTRAINTS

1. \`slug\` — kebab-case, max 40 chars, descriptive
2. \`table_name\` — MUST start with "exo_app_", lowercase, underscores only
3. \`columns\` — DO NOT include id, tenant_id, created_at, updated_at (these are auto-added)
4. Column types MUST be one of: text, integer, bigint, numeric, boolean, date, timestamptz, jsonb, real
5. Column names — lowercase, underscores, no spaces
6. \`display_columns\` — max 6 columns (fits widget width)
7. \`form_fields\` — match column names exactly
8. Form field types: text, number, date, boolean, select, textarea, rating, url, image_url
9. \`name\` and labels — Use Polish if user's message is in Polish, English otherwise
10. Keep it practical — don't over-engineer, 3-8 columns for most apps
11. \`icon\` — must be a valid Lucide icon name (BookOpen, Heart, Dumbbell, Coffee, etc.)
12. \`layout\` — MUST be one of: table, cards, timeline, kanban, stats-grid, mindmap

## Column Type Guide

| Use case | Type | Example |
|----------|------|---------|
| Names, titles, notes | text | book_title, notes |
| Counts, quantities | integer | pages_read, reps |
| Money, precise numbers | numeric | amount, price |
| Yes/no flags | boolean | is_completed, is_favorite |
| Calendar dates | date | started_at, due_date |
| Precise timestamps | timestamptz | completed_at |
| Ratings (1-5, 1-10) | integer | rating, difficulty |
| Flexible/nested data | jsonb | metadata, tags |
| Measurements | real | weight_kg, temperature |

## Chart Type Guide

| Data type | Chart | When |
|-----------|-------|------|
| Over time | line | Trends (weight, mood over weeks) |
| Categories | bar | Comparisons (books per month) |
| Distribution | pie | Proportions (time per category) |

Return ONLY the JSON. No markdown, no explanation, no backticks.`;
}

/**
 * Builds the user prompt with the specific app description
 */
export function buildAppUserPrompt(description: string): string {
  return `Generate an app specification for the following user request:

"${description}"

Requirements:
1. Choose descriptive slug and table_name
2. Include all columns the user would need
3. Configure UI for best usability (forms, display, chart if applicable)
4. Keep it simple — don't add unnecessary columns
5. Match the user's language (Polish/English)

Return ONLY valid JSON, no explanation.`;
}
