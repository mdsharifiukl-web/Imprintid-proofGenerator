// Vercel serverless entry point. Everything this needs (app.js, lib/db.js,
// bc-field-map.js) lives in this same api/ folder — keeping the require
// chain inside one directory tree is what makes Vercel's automatic
// dependency bundler reliably include all of it.
module.exports = require('./app');
