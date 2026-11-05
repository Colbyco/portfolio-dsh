/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
 exports.up = function(knex) {
    return knex.raw(`
        INSERT INTO book 
            (book_id, book_name, author_id, published_date)

        VALUES 
            ('1', 'Harry Potter and the Sorcerer’s Stone', '1', '1997-6-26'),
            ('2', 'Harry Potter and the Chamber of Secrets', '1', '1998-7-2'),
            ('3', 'Harry Potter and the Prisoner of Azkaban', '1', '1999-7-8'),
            ('4', 'Harry Potter and the Goblet of Fire', '1', '2000-7-8'),
            ('5', 'Harry Potter and the Order of the Phoenix', '1', '2003-6-21'),
            ('6', 'Harry Potter and the Half-Blood Prince', '1', '2005-7-16'),
            ('7', 'Harry Potter and the Deathly Hallows', '1', '2007-7-14')
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    DELETE FROM book WHERE book_id='1'
    DELETE FROM book WHERE book_id='2'
    DELETE FROM book WHERE book_id='3'
    DELETE FROM book WHERE book_id='4'
    DELETE FROM book WHERE book_id='5'
    DELETE FROM book WHERE book_id='6'
    DELETE FROM book WHERE book_id='7'
  `)
};
