# Kinetic

Workout tracker with an AI coach. FastAPI and MongoDB on the backend, React on the frontend.

## Features

- Workout logging set by set, with exercise autocomplete, PRs, a yearly heatmap and suggestions from past sessions
- Programs: build a weekly schedule, follow one and start the day's session from it; starter templates
  (PPL, 5/3/1 BBB, GZCLP, StrongLifts, Full Body)
- Biometrics (weight, body fat, measurements, wellness) with trend charts
- Nutrition log with macros and 7/30-day history; meal photo analysis through a Groq vision model
- AI coach: streaming chat (SSE) built on LangGraph, with the active program, biometrics and nutrition as context,
  editable messages with branches, and inline charts
- Performance dashboard: volume, session count and duration over 7/30/90 days
- CSV export of workouts, nutrition and biometrics
- Auth: JWT access and refresh tokens, logout through a Redis blocklist, password change and reset

## Stack

| Part | Tech |
|---|---|
| API | FastAPI, Pydantic v2, Beanie (MongoDB ODM on Motor), Redis |
| AI | LangGraph + LangChain; Anthropic by default, OpenAI, Groq or Google through config |
| Web | React 19, Vite, Tailwind CSS v4, React Router v7 |
| Tests | pytest with mongomock-motor and fakeredis; Vitest with MSW |

## Running locally

Needs Python 3.11+, Node 20+, MongoDB 7+ and Redis 7+.

```bash
docker run -d -p 27017:27017 mongo:7
docker run -d -p 6379:6379 redis:7
```

### API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then set JWT_SECRET and an LLM key
uvicorn main:app --reload --port 8000
```

On startup the API checks MongoDB and Redis and seeds the exercise catalog and program templates.
`GET /health` reports both. Interactive docs are at http://localhost:8000/docs.

To get a user with history to click around with:

```bash
python seed_user.py --weeks 16     # test@kinetic.dev / Test1234!
```

### Web

```bash
cd frontend
npm ci
npm run dev                      # http://localhost:5173
```

The frontend calls the API at `http://localhost:8000`, and the API allows CORS from `http://localhost:5173`.

## Tests

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm test && npm run lint
```

The backend tests need no running services. They cover auth (register, login, refresh, logout blocklist), workouts
and programs, including per-user isolation.

## API

All routes are under `/api` and need a bearer token except register, login, refresh and password reset.

| Group | Routes |
|---|---|
| auth | `POST /auth/register` `/auth/login` `/auth/refresh` `/auth/logout` `/auth/password-reset/request` `/auth/password-reset/confirm` |
| users | `GET` `PATCH /users/me`, `POST /users/me/change-password` |
| workouts | `GET` `POST /workouts`, `GET` `PATCH` `DELETE /workouts/{id}`, `GET /workouts/stats` `/prs` `/heatmap` `/suggestions` `/exercises` |
| programs | `GET` `POST /programs`, `GET /programs/active`, `GET` `PATCH` `DELETE /programs/{id}`, `GET /programs/{id}/day` `/completions`, `POST /programs/{id}/follow` `/unfollow` `/advance` |
| templates | `GET /templates`, `GET /templates/{id}`, `POST /templates/{id}/import` |
| exercises | `GET /exercises`, `/exercises/muscles`, `/exercises/session-muscles`, `/exercises/{name}`, `/exercises/{name}/level` |
| biometrics | `GET` `POST /biometrics`, `GET /biometrics/latest` `/trends`, `PATCH` `DELETE /biometrics/{id}` |
| nutrition | `GET /nutrition`, `GET /nutrition/history`, `PATCH` `DELETE /nutrition/{id}`, `POST /nutrition/analyze-image` |
| conversations | `GET` `POST /conversations`, `GET` `PATCH` `DELETE /conversations/{id}`, `POST /conversations/{id}/message` (SSE), `POST /conversations/{id}/seed`, `PATCH /conversations/{id}/active-branch` |
| export | `GET /export/workouts` `/export/nutrition` `/export/biometrics` |
