# ATLAS Phase T — Trace
## Life Management System Design

### Data Schema

**Core Tables:**

```
users
- id (uuid, primary key)
- email (text)
- name (text)
- phone (text)
- timezone (text)
- created_at (timestamp)
- settings (jsonb)

tasks
- id (uuid, primary key)
- user_id (uuid, foreign key)
- title (text)
- description (text)
- status (enum: pending, in_progress, done, cancelled)
- priority (enum: low, medium, high, urgent)
- due_date (timestamp)
- category (text: work, personal, health, finance)
- created_at (timestamp)
- completed_at (timestamp)

health_logs
- id (uuid, primary key)
- user_id (uuid, foreign key)
- date (date)
- sleep_hours (decimal)
- exercise_minutes (integer)
- water_intake_ml (integer)
- mood (enum: poor, okay, good, great)
- notes (text)
- created_at (timestamp)

finances
- id (uuid, primary key)
- user_id (uuid, foreign key)
- type (enum: income, expense, investment, debt)
- amount (decimal)
- currency (text, default: 'USD')
- category (text)
- description (text)
- date (date)
- recurring (boolean)
- recurring_interval (text: daily, weekly, monthly, yearly)
- created_at (timestamp)

finance_goals
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (text)
- target_amount (decimal)
- current_amount (decimal)
- deadline (date)
- status (enum: active, achieved, cancelled)
- created_at (timestamp)

voice_interactions
- id (uuid, primary key)
- user_id (uuid, foreign key)
- transcript (text)
- intent (text)
- action_taken (text)
- call_duration_seconds (integer)
- timestamp (timestamp)

notifications
- id (uuid, primary key)
- user_id (uuid, foreign key)
- type (enum: task_reminder, health_checkin, finance_alert, voice_call)
- title (text)
- message (text)
- scheduled_at (timestamp)
- sent_at (timestamp)
- status (enum: pending, sent, failed)
```

**Relationships:**
- users 1:N tasks
- users 1:N health_logs
- users 1:N finances
- users 1:N finance_goals
- users 1:N voice_interactions
- users 1:N notifications

---

### Integrations Map

| Service | Purpose | Auth Type | Cost | MCP Available? |
|---------|---------|-----------|------|----------------|
| **Supabase** | Database + Auth + Storage | API Key | $25/mo (pro) | Yes |
| **Vapi** | Voice AI assistant | API Key | ~$0.05/min | No (direct API) |
| **Twilio** | Voice calls + SMS | API Key | Pay-as-go (~$0.01/min) | Yes |
| **Google Workspace** | Calendar, Gmail, Drive | OAuth 2.0 | Existing | Yes (via MCP) |
| **GHL (GoHighLevel)** | CRM, automation | API Key | Existing | No (direct API) |
| **OpenAI** | LLM processing (via Vapi) | API Key | $0.002/1K tokens | Via Vapi |

**Total Estimated Monthly Cost:** ~$30-50 depending on usage

---

### Technology Stack Proposal

**Frontend:**
- **Framework:** Next.js 14 (App Router)
- **UI Library:** shadcn/ui + Tailwind CSS
- **State Management:** React Context + Zustand
- **Voice Interface:** Vapi Web SDK
- **Auth:** Supabase Auth
- **Deployment:** VPS (Docker container)

**Backend:**
- **API:** Next.js API routes + Supabase Edge Functions
- **Database:** Supabase (PostgreSQL)
- **Real-time:** Supabase Realtime subscriptions
- **Cron Jobs:** Supabase pg_cron (for notifications)
- **File Storage:** Supabase Storage

**Integrations:**
- **Voice AI:** Vapi (conversational interface)
- **Voice Calls:** Twilio Voice API
- **SMS:** Twilio Messaging API
- **Calendar:** Google Calendar API
- **Email:** Gmail API
- **CRM:** GHL API (webhooks + direct calls)

**DevOps:**
- **Hosting:** VPS (Ubuntu + Docker)
- **Web Server:** Nginx reverse proxy
- **SSL:** Let's Encrypt
- **CI/CD:** GitHub Actions
- **Monitoring:** Supabase logs + custom dashboard

---

### Edge Cases & Constraints

**Rate Limits:**
- Vapi: No published limits (but charged per minute)
- Twilio: 1 call/second default (can increase)
- Google Calendar API: 1M requests/day (plenty)
- GHL API: 120 requests/minute
- Supabase: 500 concurrent connections (Pro plan)

**Failure Scenarios:**
1. **Voice call fails mid-conversation**
   - Store partial transcript
   - Send SMS fallback
   - Resume context on next interaction

2. **Database connection timeout**
   - Retry with exponential backoff
   - Cache critical data client-side
   - Show offline mode UI

3. **API quota exceeded**
   - Queue non-urgent requests
   - Alert user via notification
   - Graceful degradation (disable feature temporarily)

4. **Voice AI misunderstands command**
   - Confirmation prompts for critical actions (money transfers, deletions)
   - Undo capability for last 5 actions
   - Manual override always available

5. **User loses internet on mobile**
   - Service worker caching
   - Offline data entry queued for sync
   - Clear sync status indicator

**Security Considerations:**
- Row-level security in Supabase
- API keys in environment variables (never client-side)
- Voice authentication for sensitive actions
- Input sanitization on all user data
- HTTPS only (enforced)

**Cost Controls:**
- Daily spend alerts (Vapi + Twilio)
- Usage dashboard (track per-service costs)
- Voice session timeout (10min max)
- Monthly budget caps in code

---

### Voice Interface Flow

**Sample Interactions:**

1. **Task Management:**
   - "Add task: call accountant tomorrow at 2pm"
   - "What's on my list today?"
   - "Mark 'email proposal' as done"

2. **Health Tracking:**
   - "Log: slept 7 hours, feeling good"
   - "Remind me to drink water every 2 hours"
   - "How's my exercise streak?"

3. **Finance Management:**
   - "Log expense: $45 for groceries"
   - "How much did I spend this week?"
   - "Set goal: save $5000 by June"

4. **Smart Queries:**
   - "What should I focus on today?"
   - "Am I on track to hit my money goals?"
   - "Schedule my week based on priorities"

---

### Data Flow Architecture

```
User Voice Input
    ↓
Vapi (speech-to-text + intent detection)
    ↓
Next.js API Route (business logic)
    ↓
Supabase (data persistence)
    ↓
Real-time update to client
    ↓
UI updates + voice confirmation
```

**Webhook Flow (GHL → System):**
```
GHL Event (new lead, appointment)
    ↓
Webhook to Next.js API
    ↓
Create task in Supabase
    ↓
Trigger notification
    ↓
Voice call via Vapi/Twilio (optional)
```

---

### MVP Features (Phase 1)

**Must Have:**
- [ ] User auth (Supabase)
- [ ] Task CRUD (voice + web)
- [ ] Basic health logging (sleep, mood)
- [ ] Expense tracking (voice + web)
- [ ] Voice interface (Vapi integration)
- [ ] Daily summary view
- [ ] Mobile-responsive UI

**Nice to Have (Phase 2):**
- [ ] Google Calendar sync
- [ ] GHL integration (leads → tasks)
- [ ] SMS reminders (Twilio)
- [ ] Finance goal tracking
- [ ] Health trends/charts
- [ ] Voice calls (proactive check-ins)

**Future:**
- [ ] AI-powered insights
- [ ] Habit streaks gamification
- [ ] Multi-user (family mode)
- [ ] Export to Drive/Sheets

---

## Next Step: User Approval

Review this design. Any changes needed before we validate connections (Phase L)?