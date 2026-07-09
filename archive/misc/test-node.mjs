import { MacronizerAPI } from './dist/index.js';

async function run() {
    console.log("Initializing Macronizer...");
    const macronizer = MacronizerAPI.getInstance({
        useWasm: false, // Start without WASM for simpler testing if needed, or true to test WASM
        confidenceThreshold: 0.80
    });
    
    // Polyfill fetch and locateFile for Node environment if using WASM
    // But let's just use the fallback tagger first
    
    await macronizer.initialize();
    
    const text = 'Gallia est omnis divisa in partes tres';
    console.log(`Processing: "${text}"`);
    
    const result = await macronizer.process(text);
    
    if (result.success) {
        console.log('\n--- MACRONIZED OUTPUT ---');
        console.log(result.macronizedText);
        console.log('-------------------------\n');
    } else {
        console.error("Error:", result.error);
    }
}

run().catch(console.error);
