const { DatabaseSync } = require('node:sqlite');

const database = new DatabaseSync(':memory:');
database.exec("CREATE TABLE smoke(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO smoke(value) VALUES ('ok');");
const row = database.prepare('SELECT value FROM smoke').get();
console.log(JSON.stringify({ node: process.versions.node, sqlite: row.value }));
database.close();
