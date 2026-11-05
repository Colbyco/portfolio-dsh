// ORIGINAL: library-api/library.js (July 2022), unchanged except the require path
// ('./db' -> './db.cjs') because the file now uses the .cjs extension.
const knex = require('./db.cjs');
const db = require('./db.cjs');

// Create
async function createAuthor(author_name) {
    return await db('author').insert({ author_name }).returning(['author_id', 'author_name']);
}

async function createBook({ book_name, author_id, published_date, owned, on_hand }) {
    return await db('book')
        .insert({ book_name, author_id, published_date, owned, on_hand })
        .returning(['book_id', 'book_name', 'author_id', 'published_date', 'owned', 'on_hand']);
}

// Read
async function getAuthors() {
    return await db('author').select('*');
}

async function getBooks() {
    return await db('book').select('*');
}

async function findAuthor(author_id) {
    return await db('author').select('author_name').where({ author_id });
}

async function findBook(book_id) {
    return await db('book').select('*').where({ book_id });
}

// Update
async function updateAuthor(author_id, author_name) {
    return await db('author').update({ author_name }).where({ author_id }).returning(['author_id', 'author_name']);
}

async function updateBook(book_id, { book_name, author_id, published_date, owned, on_hand }) {
    return await db('book')
        .update({ book_name, author_id, published_date, owned, on_hand })
        .where({ book_id })
        .returning(['book_id', 'book_name', 'author_id', 'published_date', 'owned', 'on_hand']);
}

// Delete
async function deleteBook(book_id) {
    return await db('book')
        .where({ book_id })
        .del()
        .returning(['book_id', 'book_name', 'author_id', 'published_date', 'owned', 'on_hand']);
}

module.exports = {
    createAuthor,
    createBook,
    getAuthors,
    getBooks,
    findAuthor,
    findBook,
    updateAuthor,
    updateBook,
    deleteBook,
};
