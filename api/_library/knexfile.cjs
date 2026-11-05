// ADAPTED: library-api/knexfile.js
// Original: client 'pg' with connectionString process.env.DATABASE_URL (+ ssl in production),
//           searchPath ['public'], migrations in ./migrations run with `knex migrate:latest`.
// Preview:  client knex-pglite = real PostgreSQL compiled to WASM, in memory, one per function
//           instance. No DATABASE_URL, no dotenv, no network database. searchPath is kept.
//           Migrations are loaded through an explicit source (static requires) so serverless file
//           tracing always bundles them; they are run on cold start by ../library.js.
const ClientPGLite = require('knex-pglite');

module.exports = {
    client: ClientPGLite,
    connection: {}, // no filename/dataDir -> in-memory PGlite
    searchPath: ['public'],
    migrations: {
        migrationSource: require('./migration-source.cjs'),
    },
};
