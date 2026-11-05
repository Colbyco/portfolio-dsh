/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
 exports.up = function(knex) {
    return knex.raw(`
        CREATE TABLE book (
            book_id int primary key not null,
            book_name text not null,
            author_id int not null,
            foreign key (author_id) references author(author_id),
            published_date date not null
        )
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`DROP TABLE book`)
};
