const fs = require('fs');
const content = fs.readFileSync('latin_macronizer/lemmas.py', 'utf8');
const lines = content.split('\n');
const matches = [];
for (let i = 0; i < lines.length; i++) {
  if (/matrona/i.test(lines[i])) {
    matches.push({line: i+1, text: lines[i]});
    if (matches.length >= 20) break;
  }
}
console.log('Found', matches.length, 'lines:');
matches.forEach(m => console.log(m.line + ':', m.text));
