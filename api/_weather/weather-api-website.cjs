// ORIGINAL: weather-database-website/weather-api-website.js (August 2021). Routes, handlers,
// the OpenWeatherMap request and the record mapping are unchanged.
// Preview adaptations (each marked "PREVIEW:" below):
//   1. dotenv removed (no API key or DATABASE_URL any more).
//   2. `axios` is the compat client in ./openweather-compat.cjs: it answers the original
//      OpenWeatherMap URL with keyless Open-Meteo data in the OpenWeatherMap response shape.
//   3. require paths use the .cjs files of this folder; views path set explicitly
//      (the original relied on the process working directory).
//   4. app.listen() replaced by module.exports = app; ../weather.js mounts it under /api/weather.
// PREVIEW: require('dotenv').config();
const express = require('express');
const axios = require('./openweather-compat.cjs'); // PREVIEW: was require('axios')
const weatherRepo = require('./weather-repository.cjs'); // PREVIEW: was require('./weather-repository')
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/css', express.static(__dirname + '/public/css'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); // PREVIEW: added
const apiKey = process.env.API_KEY;

app.get('/', async (req, res) => {
    const data = await weatherRepo.getAllWeatherData();
    return res.render('index', { data });
});

app.post('/', (req, res) => {

    const cityName = req.body.city_name;

    return axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=imperial`)
        .then(async function (response) {
            // handle success
            const record = {
                city_name: response.data.name,
                weather_conditions: response.data.weather[0].main,
                temp: response.data.main.temp,
                feels_like: response.data.main.feels_like,
                temp_min: response.data.main.temp_min,
                temp_max: response.data.main.temp_max,
                pressure: response.data.main.pressure,
                humidity: response.data.main.humidity,
                ts: new Date(),
            };
            await weatherRepo.addWeatherData(record);
            const allWeatherData = await weatherRepo.getAllWeatherData();
            return res.render('index', {data: allWeatherData, cityName});
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        });
});


// PREVIEW: app.listen(process.env.PORT || 80, () => {
// PREVIEW:     console.log('Web Server Started');
// PREVIEW: });
module.exports = app;
