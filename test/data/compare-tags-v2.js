// Paste into browser console at http://localhost:8080
// AFTER Initialize completes. Tests WASM RFTagger tags vs native.
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

  // The macronizer creates WasmTagger internally. Find it.
  // api.macronizer.tagger is the WasmTagger instance.
  // WasmTagger's internal 'tagger' holds the C++ RFTaggerJS object.
  // WasmTagger's 'wasmModule' has the Emscripten module with embind exports.

  // Approach: get the module from the global and create our own
  const factory = window.RFTaggerModule;
  if (!factory) { console.error('RFTaggerModule not on window'); return; }

  console.log('Instantiating WASM module...');
  const mod = await factory({
    locateFile: (path) => '/wasm/' + path,
    print: console.log,
    printErr: console.error
  });
  await mod.ready;

  console.log('Creating RFTagger...');
  const tagger = new mod.RFTagger();
  // loadModel(path, normalize, beamThreshold, sentStartHeuristic)
  // Native -s flag → sentStartHeuristic=true, normalize=false
  const loadOk = tagger.loadModel('/models/rftagger-ldt.model', false, 0.001, true);
  console.log('Model loaded:', loadOk);

  // Tag sentences one at a time (not batch — match native behavior)
  const results = [];
  for (const sent of sentences) {
    results.push(tagger.tagTokens(sent));
  }

  // Native tags for comparison
  const nativeTags = {
    "omnis": "a.-.p.-.-.-.f.a.-",
    "lingua": "n.-.s.-.-.-.f.b.-",
    "Matrona": "n.-.s.-.-.-.f.n.-",
    "causa": "n.-.s.-.-.-.f.b.-",
    "una": "d.-.-.-.-.-.-.-.-",
    "altera": "a.-.s.-.-.-.f.n.-",
    "gloria": "n.-.s.-.-.-.f.b.-",
    "milia": "m.-.-.-.-.-.-.-.-"
  };

  const targets = [
    {word:"omnis", s:0, w:2},
    {word:"lingua", s:1, w:9},
    {word:"lingua", s:3, w:2},
    {word:"Matrona", s:5, w:2},
    {word:"causa", s:12, w:2},
    {word:"una", s:23, w:0},
    {word:"altera", s:26, w:0},
    {word:"gloria", s:32, w:6},
    {word:"milia", s:33, w:3},
  ];

  console.log('\n=== WASM vs NATIVE ===');
  let matches = 0, total = 0;
  for (const t of targets) {
    const wasmTag = results[t.s][t.w];
    const nativeTag = nativeTags[t.word] || '?';
    const ok = wasmTag === nativeTag;
    if (ok) matches++; total++;
    console.log(`${ok ? '✓' : '✗'} ${t.word} WASM=${wasmTag} Native=${nativeTag}`);
  }
  console.log(`\nMatch: ${matches}/${total}`);

  tagger.delete();
})();
