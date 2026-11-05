// ADAPTED: weather-database-website/knexfile.js
// Original: client 'pg' with connectionString process.env.DATABASE_URL (+ ssl in production),
//           searchPath ['public'], migrations run by `knex migrate:latest` (heroku-postbuild).
// Preview:  client knex-pglite = real PostgreSQL compiled to WASM, in memory, one per function
//           instance. No DATABASE_URL, no dotenv. searchPath is kept. The original migrations are
//           loaded through an explicit source (static requires, so serverless file tracing bundles
//           them) and run on cold start by ../weather.js.
const ClientPGLite = require('knex-pglite');

module.exports = {
    client: ClientPGLite,
    connection: {}, // no filename/dataDir -> in-memory PGlite
    searchPath: ['public'],
    migrations: {
        migrationSource: require('./migration-source.cjs'),
    },
};
