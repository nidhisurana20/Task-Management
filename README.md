# Ledger — a task manager to learn CRUD, databases, and backend basics

## About

Ledger is a full-stack task management (to-do / Kanban) app built as a
hands-on way to learn how a database, a backend, and a frontend actually
fit together. It implements complete CRUD (Create, Read, Update, Delete)
over a MySQL-backed `tasks` table through a Python (Flask) REST API,
rendered as a drag-and-drop board by a vanilla JavaScript frontend — no
frontend framework, no ORM, so every request/response and every SQL
statement is visible and traceable. A small standalone Java utility
(`TaskReport.java`) reads a CSV export of the task data and prints a
summary report, as a second, independent example of consuming the same
data outside the main app. Setup instructions for each piece are below.

Three pieces, each doing one job:

| Piece | Language | Job |
|---|---|---|
| `backend/` | **Python** (Flask) | The primary backend. Exposes a REST API over a MySQL `tasks` table — this is where CRUD actually happens. |
| `java-tool/` | **Java** | A small standalone utility. Reads a CSV the backend exports and prints a stats report. No framework, just the JDK. |
| `frontend/` | **JavaScript** (vanilla) | The browser UI: renders the board, calls the API with `fetch`, handles drag-and-drop and a live chart. |

Nothing here needs Node, Maven, or any build tool — `pip`, `javac`, and a browser are enough.

## 1. Set up MySQL

Install MySQL if you don't have it, then run the schema file. It creates the
database, the `tasks` table, a dedicated `taskapp` DB user, and a few sample rows:

```bash
mysql -u root -p < backend/schema.sql
```

(If your root account has no password, drop `-p`.)

This also creates a `taskapp` MySQL user with password `taskapp_pw` — the
backend connects as this user rather than root, because root's default
Ubuntu auth method (socket auth) doesn't work with most database drivers
over the network. Change the password in `schema.sql` before using this
anywhere beyond your own machine.

## 2. Run the Python backend

```bash
cd backend
pip install -r requirements.txt
python3 app.py
```

Open **http://localhost:5000** — Flask serves the frontend directly, so
there's nothing separate to start for the UI.

To point at a different MySQL host/user/password/database, set environment
variables instead of editing code: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

### API endpoints

| Method | Path | Does |
|---|---|---|
| GET | `/api/tasks` | List all tasks (optional `?status=todo`) |
| GET | `/api/tasks/<id>` | Get one task |
| POST | `/api/tasks` | Create a task |
| PUT | `/api/tasks/<id>` | Update a task (partial — omitted fields keep their value) |
| DELETE | `/api/tasks/<id>` | Delete a task |
| POST | `/api/tasks/export` | Write every task to `backend/tasks_export.csv` |

## 3. Use the frontend

* Add a task with the form at the top.
* Drag a card between columns to change its status.
* Click **Edit** to change title/description/priority/due date, or **Delete** to remove it.
* Search and the priority dropdown filter the board live (client-side, no extra requests).
* The panel on the right is a small hand-drawn bar chart (plain `<canvas>`, no chart library) showing the status breakdown.
* **Export CSV** calls `/api/tasks/export` — that's the hand-off point to the Java tool below.

## 4. Run the Java report tool

This is intentionally dependency-free: just the JDK, no Maven/Gradle, no
external libraries — so it compiles anywhere a JDK is installed.

```bash
cd java-tool
javac TaskReport.java
java TaskReport ../backend/tasks_export.csv
```

It prints task counts by status and priority, a completion rate, and a
list of high-priority tasks that aren't done yet. Internally it writes its
own small CSV parser rather than a naive `split(",")`, because a
description containing a comma (which the Python exporter correctly wraps
in quotes) would otherwise misalign every column after it — a good example
of why "just split on commas" breaks on real-world CSV.

## Why this layout

The point of the exercise was to touch a real relational database, real
HTTP request/response handling, and real DOM/browser interaction, without
any of it being hidden behind a framework that does it for you:

* **Python/Flask + MySQL** — this is where you see raw SQL (`schema.sql`),
  parameterized queries (the `%s` placeholders in `app.py`, which prevent
  SQL injection), and how a request becomes a row change.
* **Java** — kept separate on purpose, as a second, independent consumer of
  the same data, to show that "the backend" and "a tool that processes the
  data" don't have to be the same program or even the same language.
* **Vanilla JS** — no framework, so every DOM update in `app.js` is a line
  you can trace back to a specific user action (a click, a drag, a keystroke).
