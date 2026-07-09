const puppeteer = require('puppeteer');

(async () => {
    console.log('Starting puppeteer with persistent profile...');
    const browser = await puppeteer.launch({ userDataDir: './.puppeteer_data' });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    page.on('response', response => {
        if (!response.ok()) {
            console.log(`FAILED RESPONSE: ${response.status()} ${response.url()}`);
        }
    });

    console.log('Navigating to http://localhost:8080/demo.html...');
    await page.goto('http://localhost:8080/demo.html', { waitUntil: 'networkidle2' });

    console.log('Clicking "Initialize Macronizer"... (IndexedDB will persist now!)');
    await page.click('#initBtn');

    console.log('Waiting for status to become Ready...');
    await page.waitForFunction(
        () => document.getElementById('status').textContent.includes('Ready'),
        { timeout: 120000 }
    );

    const inputText = `Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur. Hi omnes lingua, institutis, legibus inter se differunt. Gallos ab Aquitanis Garumna flumen, a Belgis Matrona et Sequana dividit. Horum omnium fortissimi sunt Belgae, propterea quod a cultu atque humanitate provinciae longissime absunt, minimeque ad eos mercatores saepe commeant atque ea quae ad effeminandos animos pertinent important, proximique sunt Germanis, qui trans Rhenum incolunt, quibuscum continenter bellum gerunt. Qua de causa Helvetii quoque reliquos Gallos virtute praecedunt, quod fere cotidianis proeliis cum Germanis contendunt, cum aut suis finibus eos prohibent aut ipsi in eorum finibus bellum gerunt. Apud Helvetios longe nobilissimus fuit et ditissimus Orgetorix. Is M. Messala, M. Pisone consulibus regni cupiditate inductus coniurationem nobilitatis fecit et civitati persuasit ut de finibus suis cum omnibus copiis exirent: perfacile esse, cum virtute omnibus praecederent, totius Galliae imperio potiri. Id hoc facilius iis persuasit, quod undique loci natura Helvetii continentur: una ex parte flumine Rheno latissimo atque altissimo, qui agrum Helvetium a Germanis dividit; altera ex parte monte Iura altissimo, qui est inter Sequanos et Helvetios; tertia lacu Lemanno et flumine Rhodano, qui provinciam nostram ab Helvetiis dividit. His rebus fiebat ut et minus late vagarentur et minus facile finitimis bellum inferre possent; qua ex parte homines bellandi cupidi magno dolore adficiebantur. Pro multitudine autem hominum et pro gloria belli atque fortitudinis angustos se fines habere arbitrabantur, qui in longitudinem milia passuum CCXL, in latitudinem CLXXX patebant.`;
    console.log(`Setting input text to: "${inputText.slice(0, 50)}..."`);
    
    await page.evaluate((text) => {
        document.getElementById('inputText').value = text;
    }, inputText);

    console.log('Clicking Process button...');
    const startTime = Date.now();
    await page.click('#processBtn');

    console.log('Waiting for result...');
    await page.waitForFunction(() => {
        const text = document.getElementById('outputText').textContent;
        return text && text !== 'Processing...';
    }, { timeout: 45000 });

    const duration = Date.now() - startTime;
    const result = await page.evaluate(() => document.getElementById('outputText').textContent);
    console.log('\n--- MACRONIZED OUTPUT ---');
    console.log(result);
    console.log('-------------------------');
    console.log(`Processing took ${duration}ms\n`);

    await browser.close();
})();
