const BASE_URL = 'http://localhost:8000';

// ── Token storage ──────────────────────────────────────────────────────────

export function getTokens() {
  return {
    access: localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token'),
  };
}

export function setTokens({ access_token, refresh_token }) {
  localStorage.setItem('access_token', access_token);
  if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

// ── JWT decode (no verification — just payload read) ───────────────────────

export function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const payload = decodeToken(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

// ── Core fetch ─────────────────────────────────────────────────────────────

let _refreshPromise = null;

async function doRefresh() {
  const { refresh } = getTokens();
  if (!refresh) throw new Error('No refresh token');

  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refresh}` },
  });
  if (!res.ok) {
    clearTokens();
    throw new Error('Refresh failed');
  }
  const data = await res.json();
  setTokens({ access_token: data.access_token });
  return data.access_token;
}

export async function apiFetch(path, options = {}) {
  let { access } = getTokens();

  // Proactively refresh if access token is expired
  if (access && isTokenExpired(access)) {
    if (!_refreshPromise) _refreshPromise = doRefresh().finally(() => { _refreshPromise = null; });
    access = await _refreshPromise;
  }

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (headers['Content-Type'] === null) delete headers['Content-Type'];
  if (access) headers['Authorization'] = `Bearer ${access}`;

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Retry once on 401 with refreshed token
  if (res.status === 401 && !options._retry) {
    try {
      if (!_refreshPromise) _refreshPromise = doRefresh().finally(() => { _refreshPromise = null; });
      const newAccess = await _refreshPromise;
      headers['Authorization'] = `Bearer ${newAccess}`;
      res = await fetch(`${BASE_URL}${path}`, { ...options, headers, _retry: true });
    } catch {
      clearTokens();
      window.dispatchEvent(new CustomEvent('kinetic:toast', {
        detail: { message: 'Your session expired. Please log in again.', type: 'error' },
      }));
      setTimeout(() => { window.location.href = '/login'; }, 1500);
      return;
    }
  }

  return res;
}

// ── Error helper ──────────────────────────────────────────────────────────

function parseError(data, fallback) {
  if (!data?.detail) return fallback;
  // FastAPI validation errors: detail is an array of {msg, loc, ...}
  if (Array.isArray(data.detail)) {
    return data.detail.map(e => e.msg.replace(/^Value error, /, '')).join(' ');
  }
  return data.detail;
}

// ── Auth API ───────────────────────────────────────────────────────────────

export async function apiLogin(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Login failed'));
  }
  const data = await res.json();
  setTokens(data);
  return data;
}

export async function apiRegister(email, display_name, password, password_confirm) {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, display_name, password, password_confirm }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Registration failed'));
  }
  const data = await res.json();
  setTokens(data);
  return data;
}

export async function apiLogout() {
  const { refresh } = getTokens();
  if (refresh) {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {});
  }
  clearTokens();
}

export async function apiPasswordResetRequest(email) {
  const res = await fetch(`${BASE_URL}/api/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export async function apiPasswordResetConfirm(token, password, password_confirm) {
  const res = await fetch(`${BASE_URL}/api/auth/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, password_confirm }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Reset failed');
  }
  return res.json();
}

// ── Workout API ────────────────────────────────────────────────────────────

export async function apiCreateWorkout(data) {
  const res = await apiFetch('/api/workouts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to save workout'));
  }
  return res.json();
}

export async function apiGetWorkouts({ skip = 0, limit = 50 } = {}) {
  const res = await apiFetch(`/api/workouts?skip=${skip}&limit=${limit}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load workouts'));
  }
  return res.json();
}

export async function apiGetWorkout(id) {
  const res = await apiFetch(`/api/workouts/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load workout'));
  }
  return res.json();
}

export async function apiUpdateWorkout(id, data) {
  const res = await apiFetch(`/api/workouts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to update workout'));
  }
  return res.json();
}

export async function apiDeleteWorkout(id) {
  const res = await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to delete workout'));
  }
}

// ── Program API ────────────────────────────────────────────────────────────

export async function apiCreateProgram(data) {
  const res = await apiFetch('/api/programs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to create program'));
  }
  return res.json();
}

export async function apiGetPrograms({ skip = 0, limit = 50 } = {}) {
  const res = await apiFetch(`/api/programs?skip=${skip}&limit=${limit}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load programs'));
  }
  return res.json();
}

export async function apiGetProgram(id) {
  const res = await apiFetch(`/api/programs/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load program'));
  }
  return res.json();
}

export async function apiUpdateProgram(id, data) {
  const res = await apiFetch(`/api/programs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to update program'));
  }
  return res.json();
}

// ── Conversation API ───────────────────────────────────────────────────────

export async function apiCreateConversation() {
  const res = await apiFetch('/api/conversations', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function apiListConversations() {
  const res = await apiFetch('/api/conversations');
  if (!res.ok) throw new Error('Failed to load conversations');
  return res.json();
}

export async function apiGetConversation(id) {
  const res = await apiFetch(`/api/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to load conversation');
  return res.json();
}

export async function apiDeleteConversation(id) {
  await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function apiSeedConversation(id, messages) {
  await apiFetch(`/api/conversations/${id}/seed`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
}

export async function apiSetActiveBranch(convId, tipId) {
  const res = await apiFetch(`/api/conversations/${convId}/active-branch`, {
    method: 'PATCH',
    body: JSON.stringify({ tip_id: tipId }),
  });
  if (!res.ok) throw new Error('Failed to switch branch');
  return res.json();
}

export async function apiDeleteProgram(id) {
  const res = await apiFetch(`/api/programs/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to delete program'));
  }
}

export async function apiGetActiveProgram() {
  const res = await apiFetch('/api/programs/active');
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load active program'));
  }
  const data = await res.json();
  return data ?? null;
}

export async function apiFollowProgram(id) {
  const res = await apiFetch(`/api/programs/${id}/follow`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to follow program'));
  }
  return res.json();
}

export async function apiUnfollowProgram(id) {
  const res = await apiFetch(`/api/programs/${id}/unfollow`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to unfollow program'));
  }
  return res.json();
}

export async function apiAdvanceProgram(id) {
  const res = await apiFetch(`/api/programs/${id}/advance`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to advance program'));
  }
  return res.json();
}

export async function apiGetProgramCompletions(programId) {
  const res = await apiFetch(`/api/programs/${programId}/completions`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load completions'));
  }
  return res.json();
}

export async function apiGetDayWithTargets(planId, week, day) {
  const res = await apiFetch(`/api/programs/${planId}/day?week=${week}&day=${day}`);
  if (!res.ok) throw new Error('Failed to compute targets');
  return res.json(); // { week, day, label, activities: [...with computed targets...] }
}

// ── User API ───────────────────────────────────────────────────────────────

export async function apiGetMe() {
  const res = await apiFetch('/api/users/me');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to load profile'));
  }
  return res.json();
}

export async function apiUpdateMe(data) {
  const res = await apiFetch('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to update profile'));
  }
  return res.json();
}

export async function apiChangePassword(current_password, new_password) {
  const res = await apiFetch('/api/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to change password'));
  }
}

// ── Biometrics API ─────────────────────────────────────────────────────────

export async function apiGetBiometrics({ skip = 0, limit = 100 } = {}) {
  const res = await apiFetch(`/api/biometrics?skip=${skip}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load biometrics');
  return res.json();
}

export async function apiGetLatestBiometric() {
  const res = await apiFetch('/api/biometrics/latest');
  if (!res.ok) throw new Error('Failed to load latest biometric');
  return res.json();
}

export async function apiCreateBiometric(data) {
  const res = await apiFetch('/api/biometrics', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to save measurement'));
  }
  return res.json();
}

export async function apiUpdateBiometric(id, data) {
  const res = await apiFetch(`/api/biometrics/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to update measurement'));
  }
  return res.json();
}

export async function apiDeleteBiometric(id) {
  const res = await apiFetch(`/api/biometrics/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete measurement');
}

// ── Nutrition API ──────────────────────────────────────────────────────────

export async function apiGetNutritionLog(date) {
  const query = date ? `?date=${date}` : '';
  const res = await apiFetch(`/api/nutrition${query}`);
  if (!res.ok) throw new Error('Failed to load nutrition log');
  return res.json();
}

export async function apiUpdateNutritionLog(id, data) {
  const res = await apiFetch(`/api/nutrition/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseError(err, 'Failed to update nutrition log'));
  }
  return res.json();
}

export async function apiGetNutritionHistory(days = 30) {
  const res = await apiFetch(`/api/nutrition/history?days=${days}`);
  if (!res.ok) throw new Error('Failed to load nutrition history');
  return res.json();
}

export async function apiDeleteNutritionLog(id) {
  const res = await apiFetch(`/api/nutrition/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete nutrition log');
}

export async function apiAnalyzeFood(file) {
  const form = new FormData();
  form.append('image', file);
  // Pass Content-Type as null to let the browser set the multipart boundary automatically
  const res = await apiFetch('/api/nutrition/analyze-image', {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': null },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Analysis failed');
  }
  return res.json();
}

// ── Workout aggregation API ────────────────────────────────────────────────

export async function apiGetWorkoutExercises() {
  const res = await apiFetch('/api/workouts/exercises');
  if (!res.ok) return [];
  return res.json(); // sorted string[]
}

export async function apiGetExercises(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/exercises${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Failed to load exercises');
  return res.json(); // [{ name, bodypart, category, aliases, icon_url, count, primary_muscles, secondary_muscles }]
}

export async function apiGetExercise(name) {
  const res = await apiFetch(`/api/exercises/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Exercise not found');
  return res.json(); // full record + standards_male + standards_female
}

export async function apiGetStrengthLevel(name, weightKg, bodweightKg, gender = 'male') {
  const params = new URLSearchParams({ weight: weightKg, bodyweight: bodweightKg, gender });
  const res = await apiFetch(`/api/exercises/${encodeURIComponent(name)}/level?${params}`);
  if (!res.ok) return null;
  return res.json(); // { level, thresholds, weight_kg, bodyweight }
}

export async function apiGetMuscles() {
  const res = await apiFetch('/api/exercises/muscles');
  if (!res.ok) throw new Error('Failed to load muscles');
  return res.json(); // [{ muscle_id, name, level, parent_id, group, region }]
}

export async function apiGetSessionMuscles(names) {
  if (!names?.length) return { primary: [], secondary: [] };
  const params = new URLSearchParams();
  names.forEach(n => params.append('names', n));
  const res = await apiFetch(`/api/exercises/session-muscles?${params}`);
  if (!res.ok) throw new Error('Failed to load session muscles');
  return res.json(); // { primary: string[], secondary: string[] }
}

export async function apiGetWorkoutStats() {
  const res = await apiFetch('/api/workouts/stats');
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export async function apiGetWorkoutPRs() {
  const res = await apiFetch('/api/workouts/prs');
  if (!res.ok) throw new Error('Failed to load PRs');
  return res.json();
}

export async function apiGetWorkoutHeatmap(year = null) {
  const qs = year != null ? `?year=${year}` : '';
  const res = await apiFetch(`/api/workouts/heatmap${qs}`);
  if (!res.ok) throw new Error('Failed to load heatmap data');
  return res.json();
  // => { year, rolling: bool, days: { "YYYY-MM-DD": { volume, sessions, cardio_minutes, exercises } } }
}

export async function apiGetExerciseSuggestions(names) {
  if (!names?.length) return {};
  const params = new URLSearchParams();
  names.forEach(n => params.append('exercises', n));
  const res = await apiFetch(`/api/workouts/suggestions?${params}`);
  if (!res.ok) return {};
  return res.json();
}

// ── Biometric trends API ───────────────────────────────────────────────────

export async function apiGetBiometricTrends(metric = 'weight_kg', days = 90) {
  const res = await apiFetch(`/api/biometrics/trends?metric=${metric}&days=${days}`);
  if (!res.ok) throw new Error('Failed to load trends');
  return res.json();
}

// ── Export API ─────────────────────────────────────────────────────────────

async function _downloadCsv(path, filename) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function apiExportWorkouts() {
  return _downloadCsv('/api/export/workouts?format=csv', 'workouts.csv');
}

export async function apiExportNutrition(start, end) {
  const params = new URLSearchParams({ format: 'csv' });
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return _downloadCsv(`/api/export/nutrition?${params}`, 'nutrition.csv');
}

export async function apiExportBiometrics() {
  return _downloadCsv('/api/export/biometrics?format=csv', 'biometrics.csv');
}

// ── Templates API ──────────────────────────────────────────────────────────

export async function apiGetTemplates() {
  const res = await apiFetch('/api/templates');
  if (!res.ok) throw new Error('Failed to load templates');
  return res.json();
}

export async function apiGetTemplate(templateId) {
  const res = await apiFetch(`/api/templates/${templateId}`);
  if (!res.ok) throw new Error('Failed to load template');
  return res.json();
}

export async function apiImportTemplate(templateId) {
  const res = await apiFetch(`/api/templates/${templateId}/import`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import template');
  }
  return res.json();
}

// ── Conversation update API ────────────────────────────────────────────────

export async function apiUpdateConversation(id, data) {
  const res = await apiFetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update conversation');
  return res.json();
}
