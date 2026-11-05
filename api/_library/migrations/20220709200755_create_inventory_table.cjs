/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
 exports.up = function(knex) {
    return knex.raw(`
        CREATE TABLE inventory (
            book_id int primary key not null,
            foreign key (book_id) references book(book_id),
            owned int not null default '0',
            on_hand int not null default '0'
        )
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`DROP TABLE inventory`)
};
