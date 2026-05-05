const fs = require('fs');
const path = require('path');

function fixImports(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      fixImports(fullPath);
    } else if (file.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // Add .js to relative imports without extension
      content = content.replace(/from\s+['"](\.\/[^'"]+)(?<!\.js)['"]/g, "from '$1.js'");
      content = content.replace(/from\s+['"](\.\.\/[^'"]+)(?<!\.js)['"]/g, "from '$1.js'");
      
      fs.writeFileSync(fullPath, content);
      console.log(`Fixed: ${fullPath}`);
    }
  }
}

fixImports('./dist');
console.log('Done!');
