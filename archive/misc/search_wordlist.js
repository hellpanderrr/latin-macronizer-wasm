const fs = require('fs');
const word = 'gallos'; // change as needed
const text = fs.readFileSync('latin_macronizer/macrons.txt', 'utf8');
const lines = text.split('\n');
const matches = [];
for (let i = 0; i < lines.length; i++) {
  const parts = lines[i].trim().split(/\s+/);
  if (parts.length >= 4 && parts[0].toLowerCase() === word) {
    matches.push(parts.slice(0, 4).join('\t'));
    if (matches.length >= 20) break;
  }
}
console.log(matches.join('\n'));
