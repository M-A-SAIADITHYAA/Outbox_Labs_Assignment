# 🎬 5-Minute Demo Video Walkthrough Guide (Cheat-Sheet)

Use this step-by-step checklist while recording your 5-minute Loom / YouTube walkthrough to effortlessly hit 100% of the hiring assignment evaluation criteria.

---

## ⏱️ Recommended Video Timeline (5 Minutes Total)

### 1. Introduction & High-Level Architecture (0:00 – 0:45)
- **What to show**:
  - Show the [README.md](file:///Users/saiadithyaa/Documents/antigravity/kind-brahmagupta/README.md) and Mermaid architecture diagram.
- **What to say**:
  - *"Hello! This is my submission for the ReachInbox hiring assignment: a production-grade, distributed outbound email scheduler."*
  - *"Key technical differentiators: We implemented a **Zero Cron** architecture using BullMQ delayed queues backed by Redis sorted sets (`ZSET`), an atomic Redis Lua script enforcing distributed sliding hourly limits and inter-send delays across multi-concurrency workers, AES-256 encrypted Slack rate-limit alerting, OpenSearch full-text search with automatic PostgreSQL fallback, and a pixel-accurate Next.js 14 frontend reproducing all 7 Figma views."*

---

### 2. Frontend Tour & Figma Alignment (0:45 – 1:45)
- **What to show**:
  - Open `http://localhost:3000/login` (Figma Screen 1).
  - Click **"Login"** (instant demo login as Oliver Brown).
  - Tour the OneBox dashboard:
    - **Scheduled Tab** (`http://localhost:3000` — Figma Screen 2): Show orange timestamp badges (`🕒 Tue 9:15:12 AM`), subject, snippets, and star toggles.
    - **Sent Tab** (Figma Screen 3): Show gray "Sent" pills and `🔗 Preview` links to live Ethereal SMTP web viewer.
- **What to say**:
  - *"Our Next.js 14 frontend faithfully reproduces all 7 Figma views with Tailwind CSS and Inter typography. We support Google OAuth 2.0 with JWT HTTP-only cookies and a one-click demo login for seamless evaluation."*

---

### 3. Email Compose, Send Later & CSV Upload (1:45 – 2:45)
- **What to show**:
  - Click **"Compose"** (opens ComposeModal — Figma Screen 4).
  - Click **"Send Later" (Clock icon)** to show the popover with quick presets ("Tomorrow, 10:00 AM") and datetime picker.
  - Notice the dynamic button switches to **"Send Later"** (Figma Screen 5).
  - Click **"Upload List"** (or type emails): Show green-bordered lead chips (`tame@jmail.com`, `lame@jmail.com`, `+N` overflow badge — Figma Screen 6).
  - Point out the rate limit controls: **"Delay between 2 emails: 2s"** and **"Hourly Limit: 200/hr"**.
  - Type subject, body, and click **"Send Later"**.
  - Click any email row on the list to open the **Email Detail Thread View** (Figma Screen 7), showing the yellow callout box (`⚡ Extremely Exclusive... ⚡`), raw message ID, and attachment cards.

---

### 4. Bull-Board Queue Monitor & Ethereal SMTP (2:45 – 3:45)
- **What to show**:
  - Switch tab to **Bull-Board Dashboard** at `http://localhost:3000/admin/queues` (or `http://localhost:5001/admin/queues`).
  - Show the two active queues:
    1. `email-dispatch-queue`: Show delayed jobs sleeping until target time.
    2. `email-indexing-queue`: Show completed background search indexing jobs.
  - Open an Ethereal SMTP preview URL from one of the sent emails to show the rendered email in Ethereal's web viewer.
- **What to say**:
  - *"Notice our Bull-Board queue monitor. There are zero cron jobs polling PostgreSQL. Every scheduled lead is registered as an individual BullMQ delayed job sleeping in Redis memory. When a worker thread claims a job, it acquires a 2-phase DB lease lock and dispatches to Ethereal SMTP."*

---

### 5. Distributed Rate Limiter & Slack Live Alerts (3:45 – 4:25)
- **What to show**:
  - Click the **"Slack Alerts"** button on the bottom left sidebar. Show the Slack integration modal (connect/disconnect state).
  - In terminal, run:
    ```bash
    npm --prefix backend run test:load-1000
    ```
  - Show the output: 1,000 delayed jobs enqueued in 48ms, 25 concurrent worker requests tested against a limit of 5:
    - Exactly 5 allowed immediately.
    - 20 rate-limited and rescheduled to next hour.
    - Exactly 1 Slack alert dispatched (deduplicated via Redis Lua).
- **What to say**:
  - *"Here is our 1,000-email concurrent load test. Notice that our Redis Lua script strictly enforced the hourly cap across 25 concurrent requests without race conditions, rescheduled the overflow to the next hour with random jitter, and emitted exactly one Slack alert for the entire breach window."*

---

### 6. Sub-50ms Search with OpenSearch & PostgreSQL Fallback (4:25 – 5:00)
- **What to show**:
  - Type a query into the top search bar on the homepage (e.g. `Strategy` or `Connor`).
  - Point out the latency badge: **`⚡ OpenSearch (12ms)`**.
  - In terminal, run the crash resilience test:
    ```bash
    npm --prefix backend run test:crash
    ```
  - Show that 10/10 jobs survived server crash and executed with zero duplicates.
- **What to say**:
  - *"Our full-text search engine runs on OpenSearch 3.8 / Elasticsearch with multi-match boosting and sub-50ms latency. If OpenSearch ever goes down, the system transparently falls back to PostgreSQL ILIKE queries with zero downtime. And as proven by our crash resilience test, all delayed jobs persist safely in Redis across server reboots."*
  - *"Thank you for your time and consideration!"*
