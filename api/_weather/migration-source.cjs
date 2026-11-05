// PREVIEW ADDITION: knex migration source listing the ORIGINAL migration files (copied verbatim
// from weather-database-website/migrations, renamed .js -> .cjs) in their original order.
// Static require() calls let Vercel's file tracer bundle them; knex records the original names.
const migrations = {
    '20210626004720_create_weather_table.js': require('./migrations/20210626004720_create_weather_table.cjs'),
    '20210626040456_add_timestamp_column.js': require('./migrations/20210626040456_add_timestamp_column.cjs'),
};

module.exports = {
    getMigrations: async () => Object.keys(migrations).sort(),
    getMigrationName: (name) => name,
    getMigration: async (name) => migrations[name],
};
