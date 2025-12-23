#!/usr/bin/env node

import fs from 'fs/promises';
import htmlnano from 'htmlnano';

// Catch uncaught exceptions (e.g., Terser parsing errors) and exit gracefully
process.on('uncaughtException', (err) => {
  // Log error to stderr for debugging (stdout is reserved for JSON timing)
  console.error('htmlnano worker uncaught exception:', err.stack || err);
  process.exit(1);
});

const [inputFile, outputFile] = process.argv.slice(2);

if (!inputFile || !outputFile) {
  process.exit(1);
}

try {
  const data = await fs.readFile(inputFile, 'utf8');

  // Start timing just before minification (exclude process spawn overhead)
  const startTime = Date.now();
  const result = await htmlnano.process(data, {}, htmlnano.presets.max);
  const endTime = Date.now();

  await fs.writeFile(outputFile, result.html, 'utf8');

  // Send timing info to parent via stdout
  console.log(JSON.stringify({ startTime, endTime }));

  process.exit(0);
} catch (err) {
  // Log error to stderr for debugging (stdout is reserved for JSON timing)
  console.error('htmlnano worker error:', err.stack || err);
  process.exit(1);
}