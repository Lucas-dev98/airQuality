import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const app = createApp();

describe('API smoke tests', () => {
  it('returns API key status', async () => {
    const response = await request(app).get('/api/keys');

    expect(response.status).toBe(200);
    expect(typeof response.body.hasOpenWeatherApiKey).toBe('boolean');
  });

  it('validates missing weather parameters', async () => {
    const response = await request(app).get('/api/weather');

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('validates reverse geocode query', async () => {
    const response = await request(app).get('/api/reverse-geocode?lat=a&lon=b');

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('supports anonymous profile persistence', async () => {
    const profileId = 'test-profile-1';
    const putResponse = await request(app)
      .put(`/api/user-preferences/${profileId}`)
      .send({
        locale: 'pt',
        email: 'qa@example.com',
        alertPreferences: {
          heatThreshold: 35,
          rainThreshold: 0.6,
          windThreshold: 8,
          aqiThreshold: 3,
          notificationsEnabled: true,
        },
      });

    const getResponse = await request(app).get(`/api/user-preferences/${profileId}`);

    expect(putResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.profile?.email).toBe('qa@example.com');
  });

  it('validates alert delivery payload', async () => {
    const response = await request(app)
      .post('/api/deliver-alert')
      .send({ profileId: '', alerts: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
