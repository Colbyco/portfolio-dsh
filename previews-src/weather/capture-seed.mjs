// Build-time capture of the weather seed fixture (api/_weather/seed-observations.json).
// For each city it sends the ORIGINAL request URL through the OpenWeatherMap compat client
// (keyless Open-Meteo underneath), builds the record with the ORIGINAL field mapping, and stores
// it with its true capture timestamp plus the geocoded coordinates.
// The fixture is the seed city list and the fallback data (see PREVIEW.md).
// Usage (repo root): node previews-src/weather/capture-seed.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const axios = require('../../api/_weather/openweather-compat.cjs');
const out = fileURLToPath(new URL('../../api/_weather/seed-observations.json', import.meta.url));

const cities = ['Chicago', 'New York', 'London', 'Tokyo'];
const apiKey = undefined; // the original read process.env.API_KEY; Open-Meteo needs none
const observations = [];
for (const cityName of cities) {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=imperial`);
    observations.push({
        query: cityName,
        // same mapping as the original POST handler
        city_name: response.data.name,
        weather_conditions: response.data.weather[0].main,
        temp: response.data.main.temp,
        feels_like: response.data.main.feels_like,
        temp_min: response.data.main.temp_min,
        temp_max: response.data.main.temp_max,
        pressure: response.data.main.pressure,
        humidity: response.data.main.humidity,
        ts: new Date().toISOString(),
        // where it was measured (used to refresh the seed with one request at runtime)
        latitude: response.data.coord.lat,
        longitude: response.data.coord.lon,
        country_code: response.data.sys.country,
    });
    console.log(`captured ${cityName}: ${response.data.weather[0].main}, ${response.data.main.temp} F`);
}

const fixture = {
    description: 'Real current-weather observations captured at build time for the Weather Database Website preview.',
    source: 'Open-Meteo Geocoding API + Forecast API (keyless), via api/_weather/openweather-compat.cjs. Weather data by Open-Meteo.com (CC BY 4.0).',
    captured_by: 'previews-src/weather/capture-seed.mjs',
    units: 'imperial (temperatures in degrees F, pressure in hPa, humidity in %)',
    observations,
};
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log(`wrote ${out}`);
