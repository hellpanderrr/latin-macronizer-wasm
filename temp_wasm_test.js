
const RFTaggerModule = require('./public/wasm/rftagger.js');

async function test() {
    const module = await RFTaggerModule();
    const fs = require('fs');
    
    // Load model into FS
    const modelData = fs.readFileSync('public/wasm/slovene.par');
    try { module.FS.mkdir('/models'); } catch(e) {}
    module.FS.writeFile('/models/model.par', modelData);
    
    // Create tagger
    const tagger = new module.RFTagger();
    const loaded = tagger.loadModel('/models/model.par', true, 0.001, false);
    
    if (!loaded) {
        console.error('Failed to load model');
        process.exit(1);
    }
    
    // Tag words
    const words = ["et", "arce", "altae"];
    const vec = new module.StringVector();
    words.forEach(w => vec.push_back(w));
    
    const tags = tagger.tagTokens(vec);
    const results = [];
    for (let i = 0; i < tags.size(); i++) {
        results.push(tags.get(i));
    }
    
    console.log(JSON.stringify(results));
}

test().catch(e => { console.error(e); process.exit(1); });
