// PREVIEW ADDITION: seed data for the sandboxed weather database.
//
// The original app starts with an empty table, and its listing query only shows rows whose `ts`
// is within the last hour. To avoid an empty first impression without faking any timestamp:
//   1. live: on cold start and at every hourly reset, current conditions for the fixture's cities
//      are fetched from Open-Meteo in ONE request (3 s timeout) and inserted through the original
//      repository with their true fetch time, using the same field mapping as the original handler;
//   2. fallback: if Open-Meteo is unreachable, the build-time observations in
//      seed-observations.json are inserted with their TRUE capture timestamps. The original
//      one-hour query then hides them, i.e. the page shows the original empty state.
const fixture = require('./seed-observations.json');
const weatherRepo = require('./weather-repository.cjs');
const compat = require('./openweather-compat.cjs');

const SEED_TIMEOUT_MS = 3000;

async function seedObservations() {
    const cities = fixture.observations;
    let live = null;
    const requestedAt = Date.now();
    let fetchedAt = requestedAt;
    try {
        live = await compat.currentWeatherFor(
            cities.map((o) => ({ name: o.city_name, latitude: o.latitude, longitude: o.longitude, country_code: o.country_code })),
            'imperial',
            { timeout: SEED_TIMEOUT_MS },
        );
        fetchedAt = Date.now();
    } catch (err) {
        console.warn('[weather preview] live seed failed, using build-time fixture:', err && err.message);
    }
    // Insert in reverse so the first fixture city is listed first (the original orders by ts DESC).
    for (let i = cities.length - 1; i >= 0; i--) {
        if (live) {
            const data = live[i];
            await weatherRepo.addWeatherData({
                city_name: data.name,
                weather_conditions: data.weather[0].main,
                temp: data.main.temp,
                feels_like: data.main.feels_like,
                temp_min: data.main.temp_min,
                temp_max: data.main.temp_max,
                pressure: data.main.pressure,
                humidity: data.main.humidity,
                // All four come from one response received at fetchedAt; stepping back 1 ms per
                // city (still inside the request window) keeps the listing order deterministic.
                ts: new Date(Math.max(requestedAt, fetchedAt - i)),
            });
        } else {
            const o = cities[i];
            await weatherRepo.addWeatherData({
                city_name: o.city_name,
                weather_conditions: o.weather_conditions,
                temp: o.temp,
                feels_like: o.feels_like,
                temp_min: o.temp_min,
                temp_max: o.temp_max,
                pressure: o.pressure,
                humidity: o.humidity,
                ts: new Date(o.ts),
            });
        }
    }
    return live ? 'live' : 'fixture';
}

module.exports = { seedObservations };
