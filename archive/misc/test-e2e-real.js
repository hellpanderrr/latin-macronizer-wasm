const puppeteer = require('puppeteer');

(async () => {
    console.log('Starting puppeteer...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Listen to console logs from the page
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    page.on('response', response => {
        if (!response.ok()) {
            console.log(`FAILED RESPONSE: ${response.status()} ${response.url()}`);
        }
    });

    console.log('Navigating to http://localhost:8080/demo.html...');
    await page.goto('http://localhost:8080/demo.html', { waitUntil: 'networkidle2' });

    console.log('Clicking "Initialize Macronizer"... (Loading dictionaries and WASM, this might take a moment if it is the first run)');
    await page.click('#initBtn');

    console.log('Waiting for status to become Ready...');
    await page.waitForFunction(
        () => document.getElementById('status').textContent.includes('Ready'),
        { timeout: 120000 }
    );

    const inputText = 'Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.';
    console.log(`Setting input text to: "${inputText}"`);
    
    await page.evaluate((text) => {
        document.getElementById('inputText').value = text;
    }, inputText);

    console.log('Clicking Process button...');
    await page.click('#processBtn');

    console.log('Waiting for result...');
    await page.waitForFunction(() => {
        const text = document.getElementById('outputText').textContent;
        return text && text !== 'Processing...';
    }, { timeout: 30000 });

    const result = await page.evaluate(() => document.getElementById('outputText').textContent);
    console.log('\n--- MACRONIZED OUTPUT ---');
    console.log(result);
    console.log('-------------------------\n');

    await browser.close();
})();
