const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'DraftAgreement.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Total lines before:', lines.length);

// Find sidebar start (the blank line before the comment) and end
let sidebarStart = -1;
let sidebarEnd   = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('3. RIGHT PANE: SHARING')) {
    // Include the blank line before the comment line
    sidebarStart = i - 1;
    console.log('Found sidebar start at 0-index:', sidebarStart, '| line', sidebarStart+1);
  }
  if (sidebarStart !== -1 && sidebarEnd === -1 && i > sidebarStart + 5) {
    // The sidebar closes with a line that is exactly "      )}" and the NEXT non-empty line starts with SAVE DRAFT NAMING
    if (lines[i].trim() === ')}') {
      // Peek ahead to check for SAVE DRAFT
      let peek = i + 1;
      while (peek < lines.length && lines[peek].trim() === '') peek++;
      if (peek < lines.length && lines[peek].includes('SAVE DRAFT NAMING')) {
        sidebarEnd = i + 1; // exclusive — do NOT include this closing )}
        console.log('Found sidebar end at 0-index:', i, '| line', i+1);
        break;
      }
    }
  }
}

if (sidebarStart === -1 || sidebarEnd === -1) {
  console.error('Could not locate sidebar! start:', sidebarStart, 'end:', sidebarEnd);
  // Show context around discovered start
  if (sidebarStart !== -1) {
    for (let k = sidebarStart; k < Math.min(sidebarStart + 10, lines.length); k++) {
      console.log(k+1, ':', lines[k]);
    }
  }
  process.exit(1);
}

const removedCount = sidebarEnd - sidebarStart;
console.log('Removing', removedCount, 'lines (', sidebarStart+1, '-', sidebarEnd, ')');

const before = lines.slice(0, sidebarStart);
const after  = lines.slice(sidebarEnd);

const result = [...before, ...after].join('\n');
fs.writeFileSync(filePath, result, 'utf8');
console.log('Done. New total lines:', result.split('\n').length);
