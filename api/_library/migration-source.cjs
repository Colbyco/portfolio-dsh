// PREVIEW ADDITION: a knex migration source listing the ORIGINAL migration files (copied verbatim
// from library-api/migrations, renamed .js -> .cjs) in their original timestamp order.
// Static require() calls let Vercel's file tracer bundle them; knex records the original names.
const migrations = {
    '20220709200246_create_author_table.js': require('./migrations/20220709200246_create_author_table.cjs'),
    '20220709200541_create_book_table.js': require('./migrations/20220709200541_create_book_table.cjs'),
    '20220709200755_create_inventory_table.js': require('./migrations/20220709200755_create_inventory_table.cjs'),
    '20220710214646_add_author.js': require('./migrations/20220710214646_add_author.cjs'),
    '20220710233405_populate_book_table.js': require('./migrations/20220710233405_populate_book_table.cjs'),
};

module.exports = {
    getMigrations: async () => Object.keys(migrations).sort(),
    getMigrationName: (name) => name,
    getMigration: async (name) => migrations[name],
};
