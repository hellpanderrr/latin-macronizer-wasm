const fs = require('fs');
const readline = require('readline');
const targetWords = new Set(['matrona', 'hi']);
const outLines = [];
const rl = readline.createInterface({
  input: fs.createReadStream('latin_macronizer/macrons.txt', { encoding: 'utf8' }),
  crlfDelay: Infinity
});
rl.on('line', (line) => {
  const parts = line.trim().split(/\s+/);
  if (parts.length >= 4 && targetWords.has(parts[0].toLowerCase())) {
    outLines.push(line);
  }
});
rl.on('close', () => {
  fs.writeFileSync('debug_entries.txt', outLines.join('\n'));
  console.log('Wrote', outLines.length, 'lines');
});
