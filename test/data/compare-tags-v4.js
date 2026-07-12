// Paste into browser console at http://localhost:8080 AFTER Initialize.
// Uses the macronizer's existing WasmTagger (no second instantiation).
(async () => {
  const sentences = [
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

  // Get the macronizer's internal WasmTagger
  const macronizer = api.macronizer;
  const wasmTagger = macronizer.tagger;
  console.log('WasmTagger:', !!wasmTagger, 'ready:', wasmTagger.isReady ? wasmTagger.isReady() : '?');
  console.log('Model loaded:', wasmTagger.modelLoaded);

  // wasmTagger has internal properties: .tagger (C++ object), .wasmModule (Emscripten module)
  const cppTagger = wasmTagger.tagger;
  const wasmModule = wasmTagger.wasmModule;
  console.log('C++ tagger:', !!cppTagger);
  console.log('Wasm module:', !!wasmModule);

  // Use tagSentences (not tagTokens — that's for single vectors)
  const results = cppTagger.tagSentences(sentences);
  console.log('Results type:', typeof results, 'length:', results?.size?.() || results?.length || '?');

  // embind VectorVectorString — iterate with .get()
  const allTags = [];
  for (let s = 0; s < sentences.length; s++) {
    const sentVec = results.get(s);
    const sentTags = [];
    for (let w = 0; w < sentences[s].length; w++) {
      sentTags.push(sentVec.get(w));
    }
    allTags.push(sentTags);
  }

  const nativeTags = {
    "omnis": "a.-.p.-.-.-.f.a.-", "lingua": "n.-.s.-.-.-.f.b.-",
    "Matrona": "n.-.s.-.-.-.f.n.-", "causa": "n.-.s.-.-.-.f.b.-",
    "una": "d.-.-.-.-.-.-.-.-", "altera": "a.-.s.-.-.-.f.n.-",
    "gloria": "n.-.s.-.-.-.f.b.-", "milia": "m.-.-.-.-.-.-.-.-"
  };

  const targets = [
    {w:"omnis",s:0,i:2},{w:"lingua",s:1,i:9},{w:"lingua",s:3,i:2},
    {w:"Matrona",s:5,i:2},{w:"causa",s:12,i:2},{w:"una",s:23,i:0},
    {w:"altera",s:26,i:0},{w:"gloria",s:32,i:6},{w:"milia",s:33,i:3}
  ];

  console.log('\n=== WASM vs NATIVE TAGS ===');
  let matches = 0;
  for (const t of targets) {
    const wt = allTags[t.s][t.i];
    const nt = nativeTags[t.w];
    const ok = wt === nt;
    if (ok) matches++;
    console.log(`${ok?'✓':'✗'} ${t.w} WASM=${wt} Native=${nt}`);
  }
  console.log(`\nMatch: ${matches}/${targets.length}`);
})();
