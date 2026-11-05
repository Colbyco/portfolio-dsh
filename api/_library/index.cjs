// ORIGINAL: library-api/index.js (July 2022). Routes and handlers are unchanged.
// Preview adaptations (each marked "PREVIEW:" below):
//   1. dotenv removed (no environment variables are needed any more).
//   2. require paths use the .cjs files of this folder; express-async-handler is vendored.
//   3. app.listen(PORT) replaced by module.exports = app; ../library.js mounts it under /api/library.
// PREVIEW: require('dotenv').config();
// const axios = require('axios');
const express = require('express');
const app = express();
const PORT = 8080;
const library = require('./library.cjs'); // PREVIEW: was require('./library')
const ah = require('./express-async-handler.cjs'); // PREVIEW: was require('express-async-handler')

app.use(express.json());

// Create

// POST - Author - /author/ - Creates an author with the given name
app.post(
    '/author',
    ah(async (req, res) => {
        return res.send(await library.createAuthor(req.body.authorName));
    }),
);

// POST - Book - /book/ - Creates a book with the given name, author_id, published_date, owned, or on_hand
app.post(
    '/book/',
    ah(async (req, res) => {
        return res.send(await library.createBook(req.body));
    }),
);

// Read

// GET - Author - /authors - return the entire authors table
app.get(
    '/authors',
    ah(async (req, res) => {
        const query = await library.getAuthors();

        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// GET - Book - /books - return the entire books table
app.get(
    '/books',
    ah(async (req, res) => {
        const query = await library.getBooks();

        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// GET - Author - /author/{author_id} - return the author with the given ID
app.get(
    '/author/:authorId',
    ah(async (req, res) => {
        const query = await library.findAuthor(await req.params.authorId);

        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// GET - Book - /book/{book_id} - Return the book with the given ID
app.get(
    '/book/:bookId',
    ah(async (req, res) => {
        const query = await library.findBook(req.params.bookId);

        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// Update

// PUT - Author - /author/{author_id} - Updates the author name with the given ID
app.put(
    '/author/:authorId',
    ah(async (req, res) => {
        const query = await library.updateAuthor(req.params.authorId, req.body.authorName);
        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// PUT - Book - /book/{book_id} - Updates the book details with the given ID
app.put(
    '/book/:bookId',
    ah(async (req, res) => {
        const query = await library.updateBook(req.params.bookId, req.body);
        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// Delete

// DELETE - Book - /book/{book_id} - Deletes the book of the given ID
app.delete(
    '/book/:bookId',
    ah(async (req, res) => {
        const query = await library.deleteBook(req.params.bookId);
        if (query.length) {
            return res.send(query);
        }
        return res.sendStatus(404);
    }),
);

// PREVIEW: app.listen(PORT, () => console.log('Server Started'));
module.exports = app;
