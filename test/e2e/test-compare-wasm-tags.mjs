import puppeteer from 'puppeteer';

const SENTENCES = [
  ["Gallia","est","omnis","divisa","in","partes","tres"],
  ["quarum","unam","incolunt","Belgae","aliam","Aquitani","tertiam","qui","ipsorum","lingua","Celtae"],
  ["nostra","Galli","appellantur"],
  ["Hi","omnes","lingua","institutis","legibus","inter","se","differunt"],
  ["Gallos","ab","Aquitanis","Garumna","flumen"],
  ["a","Belgis","Matrona","et","Sequana","dividit"],
  ["Horum","omnium","fortissimi","sunt","Belgae"],
  ["propterea","quod","a","cultu","atque","humanitate","provinciae","longissime","absunt"],
  ["minimeque","ad","eos","mercatores","saepe","commeant","atque","ea","quae","ad","effeminandos","animos","pertinent","important"],
  ["proximique","sunt","Germanis"],
  ["qui","trans","Rhenum","incolunt"],
  ["quibuscum","continenter","bellum","gerunt"],
  ["Qua","de","causa","Helvetii","quoque","reliquos","Gallos","virtute","praecedunt"],
  ["quod","fere","cotidianis","proeliis","cum","Germanis","contendunt"],
  ["cum","aut","suis","finibus","eos","prohibent","aut","ipsi","in","eorum","finibus","bellum","gerunt"],
  ["Apud","Helvetios","longe","nobilissimus","fuit","et","ditissimus","Orgetorix"],
  ["Is","M","Messala"],
  ["M","Pisone","consulibus","regni","cupiditate","inductus","coniurationem","nobilitatis","fecit","et","civitati","persuasit","ut","de","finibus","suis","cum","omnibus","copiis","exirent"],
  ["perfacile","esse"],
  ["cum","virtute","omnibus","praecederent"],
  ["totius","Galliae","imperio","potiri"],
  ["Id","hoc","facilius","iis","persuasit"],
  ["quod","undique","loci","natura","Helvetii","continentur"],
  ["una","ex","parte","flumine","Rheno","latissimo","atque","altissimo"],
  ["qui","agrum","Helvetium","a","Germanis","dividit"],
  ["altera","ex","parte","monte","Iura","altissimo"],
  ["qui","est","inter","Sequanos","et","Helvetios"],
  ["tertia","lacu","Lemanno","et","flumine","Rhodano"],
  ["qui","provinciam","nostram","ab","Helvetiis","dividit"],
  ["His","rebus","fiebat","ut","et","minus","late","vagarentur","et","minus","facile","finitimis","bellum","inferre","possent"],
  ["qua","ex","parte","homines","bellandi","cupidi","magno","dolore","adficiebantur"],
  ["Pro","multitudine","autem","hominum","et","pro","gloria","belli","atque","fortitudinis","angustos","se","fines","habere","arbitrabantur"],
  ["qui","in","longitudinem","milia","passuum","CCXL"],
  ["in","latitudinem","CLXXX","patebant"]
];

// Full native RFTagger output for prob-sent.txt (run with `rft-annotate -s -q`)
// One tag per word, reading-consecutively across all 34 sentences
const NATIVE_TAGS_FLAT = [
"Gallia","n.-.s.-.-.-.f.n.-",
"est","v.3.s.p.i.a.-.-.-",
"omnis","a.-.p.-.-.-.f.a.-",
"divisa","v.-.s.r.p.p.f.n.-",
"in","r.-.-.-.-.-.-.-.-",
"partes","n.-.p.-.-.-.f.a.-",
"tres","m.-.-.-.-.-.-.-.-",
"quarum","p.-.p.-.-.-.f.g.-",
"unam","a.-.s.-.-.-.f.a.-",
"incolunt","v.3.p.p.i.a.-.-.-",
"Belgae","n.-.p.-.-.-.m.n.-",
"aliam","n.-.s.-.-.-.f.a.-",
"Aquitani","n.-.p.-.-.-.m.n.-",
"tertiam","a.-.s.-.-.-.f.a.-",
"qui","p.-.s.-.-.-.m.n.-",
"ipsorum","p.-.p.-.-.-.m.g.-",
"lingua","n.-.s.-.-.-.f.n.-",
"Celtae","n.-.p.-.-.-.m.n.-",
"nostra","a.-.p.-.-.-.n.n.-",
"Galli","n.-.p.-.-.-.m.n.-",
"appellantur","v.3.p.p.i.p.-.-.-",
"Hi","p.-.p.-.-.-.m.n.-",
"omnes","n.-.p.-.-.-.m.n.-",
"lingua","n.-.s.-.-.-.f.b.-",
"institutis","v.-.p.r.p.p.f.b.-",
"legibus","n.-.p.-.-.-.f.b.-",
"inter","r.-.-.-.-.-.-.-.-",
"se","p.-.s.-.-.-.m.a.-",
"differunt","v.3.p.p.i.a.-.-.-",
"Gallos","n.-.p.-.-.-.m.a.-",
"ab","r.-.-.-.-.-.-.-.-",
"Aquitanis","n.-.p.-.-.-.m.b.-",
"Garumna","n.-.s.-.-.-.f.n.-",
"flumen","n.-.s.-.-.-.n.a.-",
"a","r.-.-.-.-.-.-.-.-",
"Belgis","n.-.p.-.-.-.m.b.-",
"Matrona","n.-.s.-.-.-.f.n.-",
"et","c.-.-.-.-.-.-.-.-",
"Sequana","n.-.s.-.-.-.f.n.-",
"dividit","v.3.s.p.i.a.-.-.-",
"Horum","p.-.p.-.-.-.m.g.-",
"omnium","n.-.p.-.-.-.m.g.-",
"fortissimi","a.-.p.-.-.-.m.n.s",
"sunt","v.3.p.p.i.a.-.-.-",
"Belgae","n.-.p.-.-.-.m.n.-",
"propterea","d.-.-.-.-.-.-.-.-",
"quod","c.-.-.-.-.-.-.-.-",
"a","r.-.-.-.-.-.-.-.-",
"cultu","n.-.s.-.-.-.m.b.-",
"atque","c.-.-.-.-.-.-.-.-",
"humanitate","n.-.s.-.-.-.f.b.-",
"provinciae","n.-.s.-.-.-.f.g.-",
"longissime","d.-.-.-.-.-.-.-.-",
"absunt","v.3.p.p.i.a.-.-.-",
"minimeque","d.-.-.-.-.-.-.-.-",
"ad","r.-.-.-.-.-.-.-.-",
"eos","p.-.p.-.-.-.m.a.-",
"mercatores","n.-.p.-.-.-.m.n.-",
"saepe","d.-.-.-.-.-.-.-.-",
"commeant","v.3.p.p.i.a.-.-.-",
"atque","c.-.-.-.-.-.-.-.-",
"ea","p.-.p.-.-.-.n.a.-",
"quae","p.-.p.-.-.-.n.n.-",
"ad","r.-.-.-.-.-.-.-.-",
"effeminandos","v.-.p.p.g.p.m.a.-",
"animos","n.-.p.-.-.-.m.a.-",
"pertinent","v.3.p.p.i.a.-.-.-",
"important","v.3.p.p.i.a.-.-.-",
"proximique","p.-.p.-.-.-.m.n.-",
"sunt","v.3.p.p.i.a.-.-.-",
"Germanis","n.-.p.-.-.-.m.b.-",
"qui","p.-.p.-.-.-.m.n.-",
"trans","r.-.-.-.-.-.-.-.-",
"Rhenum","n.-.s.-.-.-.m.a.-",
"incolunt","v.3.p.p.i.a.-.-.-",
"quibuscum","p.-.p.-.-.-.m.d.-",
"continenter","d.-.-.-.-.-.-.-.-",
"bellum","n.-.s.-.-.-.n.a.-",
"gerunt","v.3.p.p.i.a.-.-.-",
"Qua","d.-.-.-.-.-.-.-.-",
"de","r.-.-.-.-.-.-.-.-",
"causa","n.-.s.-.-.-.f.b.-",
"Helvetii","n.-.p.-.-.-.m.n.-",
"quoque","d.-.-.-.-.-.-.-.-",
"reliquos","a.-.p.-.-.-.m.a.-",
"Gallos","n.-.p.-.-.-.m.a.-",
"virtute","n.-.s.-.-.-.f.b.-",
"praecedunt","v.3.p.p.i.a.-.-.-",
"quod","c.-.-.-.-.-.-.-.-",
"fere","d.-.-.-.-.-.-.-.-",
"cotidianis","a.-.p.-.-.-.n.b.-",
"proeliis","n.-.p.-.-.-.n.b.-",
"cum","c.-.-.-.-.-.-.-.-",
"Germanis","n.-.p.-.-.-.m.b.-",
"contendunt","v.3.p.p.i.a.-.-.-",
"cum","c.-.-.-.-.-.-.-.-",
"aut","c.-.-.-.-.-.-.-.-",
"suis","a.-.p.-.-.-.f.b.-",
"finibus","n.-.p.-.-.-.f.b.-",
"eos","p.-.p.-.-.-.m.a.-",
"prohibent","v.3.p.p.i.a.-.-.-",
"aut","c.-.-.-.-.-.-.-.-",
"ipsi","p.-.p.-.-.-.m.n.-",
"in","r.-.-.-.-.-.-.-.-",
"eorum","p.-.p.-.-.-.m.g.-",
"finibus","n.-.p.-.-.-.m.b.-",
"bellum","n.-.s.-.-.-.n.a.-",
"gerunt","v.3.p.p.i.a.-.-.-",
"Apud","r.-.-.-.-.-.-.-.-",
"Helvetios","n.-.p.-.-.-.m.a.-",
"longe","d.-.-.-.-.-.-.-.-",
"nobilissimus","a.-.s.-.-.-.m.n.s",
"fuit","v.3.s.r.i.a.-.-.-",
"et","c.-.-.-.-.-.-.-.-",
"ditissimus","a.-.s.-.-.-.m.n.s",
"Orgetorix","n.-.s.-.-.-.m.n.-",
"Is","p.-.s.-.-.-.m.n.-",
"M","m.-.-.-.-.-.-.-.-",
"Messala","n.-.s.-.-.-.m.n.-",
"M","m.-.-.-.-.-.-.-.-",
"Pisone","n.-.s.-.-.-.m.b.-",
"consulibus","n.-.p.-.-.-.m.d.-",
"regni","n.-.s.-.-.-.n.g.-",
"cupiditate","n.-.s.-.-.-.f.b.-",
"inductus","v.-.s.r.p.p.m.n.-",
"coniurationem","n.-.s.-.-.-.f.a.-",
"nobilitatis","n.-.s.-.-.-.f.g.-",
"fecit","v.3.s.r.i.a.-.-.-",
"et","c.-.-.-.-.-.-.-.-",
"civitati","n.-.s.-.-.-.f.d.-",
"persuasit","v.3.s.r.i.a.-.-.-",
"ut","c.-.-.-.-.-.-.-.-",
"de","r.-.-.-.-.-.-.-.-",
"finibus","n.-.p.-.-.-.f.b.-",
"suis","a.-.p.-.-.-.f.b.-",
"cum","c.-.-.-.-.-.-.-.-",
"omnibus","a.-.p.-.-.-.f.b.-",
"copiis","n.-.p.-.-.-.f.b.-",
"exirent","v.3.p.i.s.a.-.-.-",
"perfacile","a.-.s.-.-.-.n.a.-",
"esse","v.-.-.p.n.a.-.-.-",
"cum","r.-.-.-.-.-.-.-.-",
"virtute","n.-.s.-.-.-.f.b.-",
"omnibus","a.-.p.-.-.-.f.b.-",
"praecederent","v.3.p.i.s.a.-.-.-",
"totius","a.-.s.-.-.-.f.g.-",
"Galliae","n.-.s.-.-.-.f.g.-",
"imperio","n.-.s.-.-.-.n.b.-",
"potiri","v.-.-.p.n.p.-.-.-",
"Id","p.-.s.-.-.-.n.n.-",
"hoc","p.-.s.-.-.-.n.a.-",
"facilius","d.-.-.-.-.-.-.-.-",
"iis","p.-.p.-.-.-.m.d.-",
"persuasit","v.3.s.r.i.a.-.-.-",
"quod","c.-.-.-.-.-.-.-.-",
"undique","d.-.-.-.-.-.-.-.-",
"loci","n.-.s.-.-.-.m.g.-",
"natura","n.-.s.-.-.-.f.n.-",
"Helvetii","n.-.p.-.-.-.m.n.-",
"continentur","v.3.p.p.i.p.-.-.-",
"una","d.-.-.-.-.-.-.-.-",
"ex","r.-.-.-.-.-.-.-.-",
"parte","n.-.s.-.-.-.f.b.-",
"flumine","n.-.s.-.-.-.n.b.-",
"Rheno","n.-.s.-.-.-.m.b.-",
"latissimo","a.-.s.-.-.-.m.b.s",
"atque","c.-.-.-.-.-.-.-.-",
"altissimo","a.-.s.-.-.-.m.b.s",
"qui","p.-.s.-.-.-.m.n.-",
"agrum","n.-.s.-.-.-.m.a.-",
"Helvetium","a.-.s.-.-.-.m.a.-",
"a","r.-.-.-.-.-.-.-.-",
"Germanis","n.-.p.-.-.-.m.b.-",
"dividit","v.3.s.p.i.a.-.-.-",
"altera","a.-.s.-.-.-.f.n.-",
"ex","r.-.-.-.-.-.-.-.-",
"parte","n.-.s.-.-.-.f.b.-",
"monte","n.-.s.-.-.-.m.b.-",
"Iura","n.-.s.-.-.-.n.n.-",
"altissimo","a.-.s.-.-.-.m.b.s",
"qui","p.-.s.-.-.-.m.n.-",
"est","v.3.s.p.i.a.-.-.-",
"inter","r.-.-.-.-.-.-.-.-",
"Sequanos","n.-.p.-.-.-.m.a.-",
"et","c.-.-.-.-.-.-.-.-",
"Helvetios","n.-.p.-.-.-.m.a.-",
"tertia","a.-.s.-.-.-.f.n.-",
"lacu","n.-.s.-.-.-.m.b.-",
"Lemanno","n.-.s.-.-.-.m.b.-",
"et","c.-.-.-.-.-.-.-.-",
"flumine","n.-.s.-.-.-.n.b.-",
"Rhodano","n.-.s.-.-.-.m.b.-",
"qui","p.-.s.-.-.-.m.n.-",
"provinciam","n.-.s.-.-.-.f.a.-",
"nostram","a.-.s.-.-.-.f.a.-",
"ab","r.-.-.-.-.-.-.-.-",
"Helvetiis","n.-.p.-.-.-.m.b.-",
"dividit","v.3.s.p.i.a.-.-.-",
"His","p.-.p.-.-.-.n.b.-",
"rebus","n.-.p.-.-.-.f.b.-",
"fiebat","v.3.s.i.i.a.-.-.-",
"ut","c.-.-.-.-.-.-.-.-",
"et","c.-.-.-.-.-.-.-.-",
"minus","d.-.-.-.-.-.-.-.-",
"late","d.-.-.-.-.-.-.-.-",
"vagarentur","v.3.p.i.s.p.-.-.-",
"et","c.-.-.-.-.-.-.-.-",
"minus","d.-.-.-.-.-.-.-.-",
"facile","d.-.-.-.-.-.-.-.-",
"finitimis","a.-.p.-.-.-.m.b.-",
"bellum","n.-.s.-.-.-.n.a.-",
"inferre","v.-.-.p.n.a.-.-.-",
"possent","v.3.p.i.s.a.-.-.-",
"qua","d.-.-.-.-.-.-.-.-",
"ex","r.-.-.-.-.-.-.-.-",
"parte","n.-.s.-.-.-.f.b.-",
"homines","n.-.p.-.-.-.m.n.-",
"bellandi","v.-.p.p.g.p.m.n.-",
"cupidi","a.-.p.-.-.-.m.n.-",
"magno","a.-.s.-.-.-.m.b.-",
"dolore","n.-.s.-.-.-.m.b.-",
"adficiebantur","v.3.p.i.i.p.-.-.-",
"Pro","r.-.-.-.-.-.-.-.-",
"multitudine","n.-.s.-.-.-.f.b.-",
"autem","c.-.-.-.-.-.-.-.-",
"hominum","n.-.p.-.-.-.m.g.-",
"et","c.-.-.-.-.-.-.-.-",
"pro","r.-.-.-.-.-.-.-.-",
"gloria","n.-.s.-.-.-.f.b.-",
"belli","n.-.s.-.-.-.n.g.-",
"atque","c.-.-.-.-.-.-.-.-",
"fortitudinis","n.-.s.-.-.-.f.g.-",
"angustos","a.-.p.-.-.-.m.a.-",
"se","p.-.p.-.-.-.m.a.-",
"fines","n.-.p.-.-.-.m.a.-",
"habere","v.-.-.p.n.a.-.-.-",
"arbitrabantur","v.3.p.i.i.p.-.-.-",
"qui","p.-.s.-.-.-.m.n.-",
"in","r.-.-.-.-.-.-.-.-",
"longitudinem","n.-.s.-.-.-.f.a.-",
"milia","m.-.-.-.-.-.-.-.-",
"passuum","n.-.p.-.-.-.m.g.-",
"CCXL","m.-.-.-.-.-.-.-.-",
"in","r.-.-.-.-.-.-.-.-",
"latitudinem","n.-.s.-.-.-.f.a.-",
"CLXXX","m.-.-.-.-.-.-.-.-",
"patebant","v.3.p.i.i.a.-.-.-",
];

// Build NATIVE_BY_SENT: map of sentence_index -> word -> tag
const NATIVE_BY_SENT = [];
let idx = 0;
for (let s = 0; s < SENTENCES.length; s++) {
  NATIVE_BY_SENT[s] = {};
  for (let w = 0; w < SENTENCES[s].length; w++) {
    const word = SENTENCES[s][w];
    const tag = NATIVE_TAGS_FLAT[idx * 2 + 1];
    NATIVE_BY_SENT[s][word] = tag;
    idx++;
  }
}

async function runComparison(page, label, configFn) {
  const result = await page.evaluate(({ sentences }) => {
    const api = window.__macronizerApi;
    const wt = api.macronizer.tagger;
    const wasmModule = wt.wasmModule;

    // Destroy and recreate with new params
    try { wt.tagger.delete(); } catch(e) {}

    const newTagger = new wasmModule.RFTagger();
    // Config applied by caller
    return { dummy: true };
  }, { sentences: SENTENCES });

  // Apply config
  await page.evaluate(configFn);

  // Now use the tagger
  const result2 = await page.evaluate(({ sentences }) => {
    const api = window.__macronizerApi;
    const wt = api.macronizer.tagger;
    const cpp = wt.tagger;

    let allTags;
    try {
      const resultsVec = cpp.tagSentences(sentences);
      allTags = [];
      for (let s = 0; s < sentences.length; s++) {
        const sv = resultsVec.get(s);
        const st = [];
        for (let w = 0; w < sentences[s].length; w++) st.push(sv.get(w));
        allTags.push(st);
      }
    } catch (e) {
      return { error: e.message };
    }
    return { allTags, params: { useSentences: wt.useSentences } };
  }, { sentences: SENTENCES });

  return result2;
}

(async () => {
  console.log('Starting puppeteer...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('[DEBUG]')) console.log('BRW:', text);
  });

  console.log('Navigating...');
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for WasmTagger
  console.log('Waiting for WasmTagger...');
  for (let attempt = 0; attempt < 300; attempt++) {
    const ready = await page.evaluate(() => {
      try {
        const api = window.__macronizerApi;
        return !!(api && api.macronizer && api.macronizer.tagger && api.macronizer.tagger.isReady());
      } catch (e) { return false; }
    });
    if (ready) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // ─── Test: normalize=true ───
  console.log('\nTesting normalize=true...');
  const r1 = await page.evaluate(({ sentences }) => {
    const api = window.__macronizerApi;
    const wt = api.macronizer.tagger;
    // wt already has normalize=true from constructor
    const cpp = wt.tagger;

    const resultsVec = cpp.tagSentences(sentences);
    const allTags = [];
    for (let s = 0; s < sentences.length; s++) {
      const sv = resultsVec.get(s);
      const st = [];
      for (let w = 0; w < sentences[s].length; w++) st.push(sv.get(w));
      allTags.push(st);
    }
    return { allTags, params: { useSentences: wt.useSentences } };
  }, { sentences: SENTENCES });

  // Compare each word
  console.log(`\nFull tag comparison: normalize=${r1.params.useSentences}`);
  let matches = 0, total = 0;
  const mismatches = [];
  for (let s = 0; s < SENTENCES.length; s++) {
    for (let w = 0; w < SENTENCES[s].length; w++) {
      const word = SENTENCES[s][w];
      const wasmTag = r1.allTags[s][w];
      const nativeTag = NATIVE_BY_SENT[s][word];
      total++;
      if (wasmTag === nativeTag) {
        matches++;
      } else {
        mismatches.push({ word, wasm: wasmTag, native: nativeTag, sent: s });
      }
    }
  }
  console.log(`Matches: ${matches}/${total} (${(matches/total*100).toFixed(1)}%)`);
  if (mismatches.length > 0) {
    console.log(`\nMismatches (${mismatches.length}):`);
    for (const m of mismatches) {
      console.log(`  ✗ ${m.word} (sent ${m.sent}): WASM=${m.wasm}  Native=${m.native}`);
    }
  }

  // ─── Test: normalize=false ───
  console.log('\nTesting normalize=false...');
  const r2 = await page.evaluate(({ sentences }) => {
    const api = window.__macronizerApi;
    const wt = api.macronizer.tagger;
    const wasmModule = wt.wasmModule;

    // Create fresh C++ tagger with normalize=false
    try { wt.tagger.delete(); } catch(e) {}
    const newTagger = new wasmModule.RFTagger();
    newTagger.loadModel('/models/rftagger-ldt.model', false, 0.001, true);

    const resultsVec = newTagger.tagSentences(sentences);
    const allTags = [];
    for (let s = 0; s < sentences.length; s++) {
      const sv = resultsVec.get(s);
      const st = [];
      for (let w = 0; w < sentences[s].length; w++) st.push(sv.get(w));
      allTags.push(st);
    }
    return { allTags };
  }, { sentences: SENTENCES });

  console.log(`Full tag comparison: normalize=false`);
  let m2 = 0;
  const mismatches2 = [];
  for (let s = 0; s < SENTENCES.length; s++) {
    for (let w = 0; w < SENTENCES[s].length; w++) {
      const word = SENTENCES[s][w];
      const wasmTag = r2.allTags[s][w];
      const nativeTag = NATIVE_BY_SENT[s][word];
      if (wasmTag === nativeTag) {
        m2++;
      } else {
        mismatches2.push({ word, wasm: wasmTag, native: nativeTag, sent: s });
      }
    }
  }
  console.log(`Matches: ${m2}/${total} (${(m2/total*100).toFixed(1)}%)`);
  if (mismatches2.length > 0) {
    console.log(`\nMismatches (${mismatches2.length}):`);
    for (const m of mismatches2) {
      console.log(`  ✗ ${m.word} (sent ${m.sent}): WASM=${m.wasm}  Native=${m.native}`);
    }
  }

  // ─── Side-by-side summary for mismatches ───
  const allMismatchWords = new Set();
  for (const m of mismatches) allMismatchWords.add(m.word + '|' + m.sent);
  for (const m of mismatches2) allMismatchWords.add(m.word + '|' + m.sent);

  if (allMismatchWords.size > 0) {
    console.log(`\n=== Detailed: all unique mismatches ===`);
    // Build lookup maps
    const w1map = {}, w2map = {};
    for (const m of mismatches) w1map[m.word + '|' + m.sent] = m;
    for (const m of mismatches2) w2map[m.word + '|' + m.sent] = m;

    for (const key of [...allMismatchWords].sort()) {
      const [word, sent] = key.split('|');
      const nt = NATIVE_BY_SENT[parseInt(sent)][word];
      const m1 = w1map[key];
      const m2 = w2map[key];
      const t1 = m1 ? m1.wasm : 'MATCH';
      const t2 = m2 ? m2.wasm : 'MATCH';
      console.log(`  ${word} (sent ${sent}): norm=true: ${t1}  norm=false: ${t2}  native: ${nt}`);
    }
  }

  await browser.close();
})();
