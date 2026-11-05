// PREVIEW ADDITION: OpenWeatherMap compat client backed by the keyless Open-Meteo APIs.
//
// The 2021 app calls
//   axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=imperial`)
// which needs a private API key. This module exposes the same `get(url)` call: for that URL it
// geocodes `q` with Open-Meteo, reads current conditions + today's range, and resolves with an
// axios-like `{ status, data }` whose `data` has the OpenWeatherMap "current weather" shape, so the
// original record mapping (response.data.name, .weather[0].main, .main.temp, ...) is untouched.
//
// Field mapping (OpenWeatherMap field  <-  Open-Meteo source):
//   name                <- geocoding results[0].name
//   weather[0].main     <- current.weather_code (WMO code) -> OpenWeatherMap group, see wmoToMain()
//   main.temp           <- current.temperature_2m
//   main.feels_like     <- current.apparent_temperature
//   main.temp_min       <- daily.temperature_2m_min[0]  (today's forecast low at that place*)
//   main.temp_max       <- daily.temperature_2m_max[0]  (today's forecast high at that place*)
//   main.pressure       <- current.pressure_msl  (hPa, sea level, same as OpenWeatherMap default)
//   main.humidity       <- current.relative_humidity_2m (%)
//   units=imperial|metric|standard -> temperature_unit fahrenheit|celsius|celsius+273.15 (kelvin)
//   * OpenWeatherMap's temp_min/temp_max were the momentary min/max across a city's area;
//     Open-Meteo has no such field, so today's daily low/high is the closest equivalent.
// Errors: unknown city -> rejects like OpenWeatherMap's 404 ("city not found"); network errors and
// timeouts (3.5 s per request, hard limit including the TCP connect phase) reject with a compact
// error. Every failure is recorded in the request context so the wrapper can show a friendly page
// (the original .catch() only logs).
// Weather data by Open-Meteo.com (CC BY 4.0), https://open-meteo.com/
const realAxios = require('axios');
const requestContext = require('./request-context.cjs');

const TIMEOUT_MS = 3500;

// axios' `timeout` only starts once a socket is connected, so a black-holed host could hang far
// longer; the AbortSignal enforces the limit for the whole request.
function httpGet(url, params, timeout = TIMEOUT_MS) {
    return realAxios.get(url, { params, timeout, signal: AbortSignal.timeout(timeout) });
}
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,pressure_msl';
const DAILY_FIELDS = 'temperature_2m_max,temperature_2m_min';

// WMO weather interpretation codes -> OpenWeatherMap "main" groups.
function wmoToMain(code) {
    if (code === 0) return 'Clear';
    if (code >= 1 && code <= 3) return 'Clouds';
    if (code === 45 || code === 48) return 'Fog';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow';
    if (code >= 95 && code <= 99) return 'Thunderstorm';
    return 'Clouds';
}

class CompatError extends Error {
    constructor(kind, status, message) {
        super(message);
        this.name = 'OpenWeatherCompatError';
        this.kind = kind; // 'not_found' | 'bad_request' | 'timeout' | 'unavailable'
        this.response = { status, data: { cod: String(status), message } };
        this.stack = `${this.name}: ${message}`; // the original .catch() console.logs it; keep logs short
    }
}

function fail(kind, status, message, detail) {
    const err = new CompatError(kind, status, message);
    const ctx = requestContext.getStore();
    if (ctx) ctx.upstreamError = { kind, status, message, ...detail };
    return err;
}

function upstreamFailure(err, detail) {
    if (err instanceof CompatError) return err;
    const timedOut = err && (['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(err.code)
        || err.name === 'CanceledError' || /timeout|aborted|canceled/i.test(err.message || ''));
    return timedOut
        ? fail('timeout', 504, 'weather service timeout', detail)
        : fail('unavailable', 502, 'weather service unavailable', detail);
}

function unitParams(units) {
    if (units === 'imperial') return { temperature_unit: 'fahrenheit', kelvin: false };
    if (units === 'metric') return { temperature_unit: 'celsius', kelvin: false };
    return { temperature_unit: 'celsius', kelvin: true }; // OpenWeatherMap "standard" = kelvin
}

async function geocode(q) {
    const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
    const name = parts[0];
    if (!name) throw fail('bad_request', 400, 'Nothing to geocode', { city: q });
    const { data } = await httpGet(GEOCODING_URL, { name, count: 10, language: 'en', format: 'json' });
    let results = Array.isArray(data && data.results) ? data.results : [];
    // "City,Country" / "City,State" qualifiers, as OpenWeatherMap accepted them.
    const qualifiers = parts.slice(1).map((s) => s.toLowerCase());
    if (results.length && qualifiers.length) {
        const matches = (r) => qualifiers.every((qq) =>
            [r.country_code, r.country, r.admin1, r.admin2]
                .filter(Boolean)
                .some((v) => v.toLowerCase() === qq || (qq.length > 2 && v.toLowerCase().startsWith(qq))));
        const filtered = results.filter(matches);
        if (filtered.length) results = filtered;
    }
    if (!results.length) throw fail('not_found', 404, 'city not found', { city: q });
    return results[0];
}

// Fetch current conditions for one or more places in ONE Open-Meteo request and return
// OpenWeatherMap-shaped objects. places: [{ name, latitude, longitude, country_code? }]
async function currentWeatherFor(places, units = 'imperial', { timeout = TIMEOUT_MS } = {}) {
    const u = unitParams(units);
    const { data } = await httpGet(FORECAST_URL, {
        latitude: places.map((p) => p.latitude).join(','),
        longitude: places.map((p) => p.longitude).join(','),
        current: CURRENT_FIELDS,
        daily: DAILY_FIELDS,
        temperature_unit: u.temperature_unit,
        timezone: 'auto',
        forecast_days: 1,
    }, timeout);
    const list = Array.isArray(data) ? data : [data];
    if (list.length !== places.length) throw new Error('unexpected Open-Meteo response');
    const t = (v) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('unexpected Open-Meteo response');
        return u.kelvin ? Math.round((v + 273.15) * 100) / 100 : v;
    };
    return list.map((item, i) => {
        const c = item && item.current;
        const d = item && item.daily;
        if (!c || !d) throw new Error('unexpected Open-Meteo response');
        return {
            coord: { lon: places[i].longitude, lat: places[i].latitude },
            weather: [{ main: wmoToMain(c.weather_code) }],
            main: {
                temp: t(c.temperature_2m),
                feels_like: t(c.apparent_temperature),
                temp_min: t(d.temperature_2m_min[0]),
                temp_max: t(d.temperature_2m_max[0]),
                pressure: c.pressure_msl,
                humidity: c.relative_humidity_2m,
            },
            sys: { country: places[i].country_code },
            name: places[i].name,
            cod: 200,
            _source: 'open-meteo',
        };
    });
}

async function get(url, config) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return realAxios.get(url, config);
    }
    if (parsed.hostname !== 'api.openweathermap.org' || parsed.pathname !== '/data/2.5/weather') {
        return realAxios.get(url, config); // anything else: plain axios
    }
    const q = (parsed.searchParams.get('q') || '').trim();
    const units = parsed.searchParams.get('units') || 'standard';
    try {
        const place = await geocode(q);
        const [data] = await currentWeatherFor([place], units);
        return { status: 200, statusText: 'OK', headers: {}, config: config || {}, data };
    } catch (err) {
        throw upstreamFailure(err, { city: q });
    }
}

module.exports = { get, geocode, currentWeatherFor, wmoToMain };
