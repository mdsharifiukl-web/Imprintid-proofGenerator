// Vercel serverless entry point. Vercel auto-detects any file in /api as a
// function — this one just hands off to the shared Express app in app.js,
// which is where all the actual route logic lives. vercel.json routes every
// /api/* request here.
module.exports = require('../app');
