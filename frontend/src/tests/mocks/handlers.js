import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:8000';

// api.js reads `exp` from the token payload and refreshes when it has passed,
// so the mock access token has to be a JWT-shaped string with a future exp.
const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export const MOCK_ACCESS_TOKEN = [
  b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({ sub: 'u1', type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

// ── Auth handlers ──────────────────────────────────────────────────────────
export const authHandlers = [
  http.post(`${BASE}/api/auth/login`, async ({ request }) => {
    const body = await request.json();
    if (body.email === 'test@example.com' && body.password === 'correct') {
      return HttpResponse.json({
        access_token: MOCK_ACCESS_TOKEN,
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
      });
    }
    return HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 });
  }),

  http.post(`${BASE}/api/auth/register`, async ({ request }) => {
    const body = await request.json();
    if (body.password !== body.password_confirm) {
      return HttpResponse.json({ detail: 'Passwords do not match' }, { status: 422 });
    }
    return HttpResponse.json({
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: 'mock-refresh-token',
      token_type: 'bearer',
    });
  }),
];

// ── Workout handlers ───────────────────────────────────────────────────────
export const workoutHandlers = [
  http.post(`${BASE}/api/workouts`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: 'mock-workout-id', ...body },
      { status: 201 },
    );
  }),

  http.get(`${BASE}/api/workouts`, () => {
    return HttpResponse.json([
      {
        id: 'w1',
        name: 'Push Day',
        started_at: new Date().toISOString(),
        completed_at: null,
        activities: [],
      },
    ]);
  }),
];

// ── Program handlers ───────────────────────────────────────────────────────
export const programHandlers = [
  http.get(`${BASE}/api/programs`, () => {
    return HttpResponse.json([
      { id: 'p1', name: 'GZCLP', weeks: [], details: {} },
    ]);
  }),
];

export const handlers = [...authHandlers, ...workoutHandlers, ...programHandlers];
