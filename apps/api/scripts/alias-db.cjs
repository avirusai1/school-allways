/**
 * Nest emits `require('@saw/db')` but @saw/db's package entry is TypeScript ESM.
 * At runtime, point the alias at the CommonJS copy nest already compiled into dist/.
 */
const Module = require('module');
const path = require('path');

const dbEntry = path.resolve(__dirname, '../dist/db/schema/index.js');
const original = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@saw/db' || request.startsWith('@saw/db/')) {
    if (request === '@saw/db') return dbEntry;
    const sub = request.slice('@saw/db/'.length);
    return path.resolve(__dirname, '../dist/db', sub);
  }
  return original.call(this, request, parent, isMain, options);
};
