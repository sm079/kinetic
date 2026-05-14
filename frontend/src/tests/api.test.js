import { describe, it, expect, beforeEach } from 'vitest';
import { apiLogin, apiGetWorkouts, apiGetPrograms, setTokens, clearTokens } from '../lib/api';
import { MOCK_ACCESS_TOKEN } from './mocks/handlers';

// Make localStorage available in jsdom
beforeEach(() => {
  clearTokens();
});

describe('apiLogin', () => {
  it('returns tokens on valid credentials', async () => {
    const result = await apiLogin('test@example.com', 'correct');
    expect(result).toHaveProperty('access_token', MOCK_ACCESS_TOKEN);
    expect(result).toHaveProperty('refresh_token', 'mock-refresh-token');
  });

  it('throws on invalid credentials', async () => {
    await expect(apiLogin('test@example.com', 'wrong')).rejects.toThrow();
  });
});

describe('apiGetWorkouts', () => {
  it('returns workout list when authenticated', async () => {
    setTokens({ access_token: MOCK_ACCESS_TOKEN, refresh_token: 'mock-refresh-token' });
    const workouts = await apiGetWorkouts();
    expect(Array.isArray(workouts)).toBe(true);
    expect(workouts.length).toBeGreaterThan(0);
    expect(workouts[0]).toHaveProperty('name', 'Push Day');
  });
});

describe('apiGetPrograms', () => {
  it('returns program list when authenticated', async () => {
    setTokens({ access_token: MOCK_ACCESS_TOKEN, refresh_token: 'mock-refresh-token' });
    const programs = await apiGetPrograms();
    expect(Array.isArray(programs)).toBe(true);
    expect(programs[0]).toHaveProperty('name', 'GZCLP');
  });
});
