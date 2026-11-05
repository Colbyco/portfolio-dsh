// ORIGINAL: weather-database-website/db.js, unchanged except the require path ('./knexfile.js' -> './knexfile.cjs').
const knexConfig = require('./knexfile.cjs');
const knex = require('knex')(knexConfig);
module.exports = knex;
