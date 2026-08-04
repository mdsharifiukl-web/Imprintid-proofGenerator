// Local development entry point — run with `npm start`.
// Vercel doesn't use this file at all (it uses api/index.js instead); this
// exists purely so you can still run and test the app on your own machine
// exactly like before, serving the frontend yourself since Vercel's native
// static file serving isn't available locally.

const path = require('path');
const express = require('express');
const app = require('./app');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('  ImprintID (local dev) is running.');
  console.log('');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  This is the same app that runs on Vercel — useful for testing');
  console.log('  changes before pushing. Make sure POSTGRES_URL is set in your');
  console.log('  .env file (copy it from your Vercel project\'s Storage tab) so');
  console.log('  this connects to the same database Vercel uses.');
  console.log('');
  if (app.bcIsConfigured()) {
    console.log('  Business Central: configured (' + app.BC.environment + ')');
  } else {
    console.log('  Business Central: not configured — see .env.example.');
  }
  console.log('');
});
