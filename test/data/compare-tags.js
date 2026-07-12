// Paste into browser console at http://localhost:8080
// Compares WASM RFTagger tags against native RFTagger (Docker) output.
// Must be pasted AFTER Initialize completes and wordlist is loaded.

(async () => {
  // Same sentences fed to native RFTagger (from test/data/prob-sent.txt)
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

  // Get the global RFTagger instance
  const tagger = RFTaggerModule.RFTagger;
  console.log('Tagger loaded:', !!tagger);

  // Tag all sentences
  const results = [];
  for (const sent of sentences) {
    results.push(tagger.tagTokens(sent));
  }

  // Native tags for comparison (from Docker run)
  const nativeTags = {
    "omnis": "a.-.p.-.-.-.f.a.-",
    "lingua": "n.-.s.-.-.-.f.b.-",   // first occurrence (after ipsorum)
    "lingua2": "n.-.s.-.-.-.f.b.-",  // second occurrence (after omnes)
    "Matrona": "n.-.s.-.-.-.f.n.-",
    "causa": "n.-.s.-.-.-.f.b.-",
    "una": "d.-.-.-.-.-.-.-.-",
    "altera": "a.-.s.-.-.-.f.n.-",
    "gloria": "n.-.s.-.-.-.f.b.-",
    "milia": "m.-.-.-.-.-.-.-.-"
  };

  // Extract target words
  const targets = [
    {word: "omnis", sentIdx: 0, wordIdx: 2},
    {word: "lingua", sentIdx: 1, wordIdx: 9},    // first occurrence
    {word: "lingua", sentIdx: 3, wordIdx: 2},    // second occurrence
    {word: "Matrona", sentIdx: 5, wordIdx: 2},
    {word: "causa", sentIdx: 12, wordIdx: 2},
    {word: "una", sentIdx: 23, wordIdx: 0},
    {word: "altera", sentIdx: 26, wordIdx: 0},
    {word: "gloria", sentIdx: 32, wordIdx: 6},
    {word: "milia", sentIdx: 33, wordIdx: 3},
  ];

  console.log('\n=== WASM vs NATIVE TAG COMPARISON ===');
  for (const t of targets) {
    const wasmTag = results[t.sentIdx][t.wordIdx];
    const nativeKey = t.word === "lingua" && t.sentIdx === 3 ? "lingua2" : t.word;
    const nativeKey2 = t.word;
    const nativeTag = nativeTags[nativeKey] || nativeTags[nativeKey2] || "?";
    const match = wasmTag === nativeTag;
    console.log(`${match ? '✓' : '✗'} ${t.word} [s${t.sentIdx} w${t.wordIdx}] WASM=${wasmTag} Native=${nativeTag}`);
  }

  // Also print all unique word→tag mappings for the 9 problem words
  console.log('\n=== ALL TAGS FOR PROBLEM WORDS ===');
  const problemWords = new Set(["omnis", "lingua", "Matrona", "causa", "una", "altera", "gloria", "milia"]);
  for (let s = 0; s < sentences.length; s++) {
    for (let w = 0; w < sentences[s].length; w++) {
      if (problemWords.has(sentences[s][w].toLowerCase())) {
        console.log(`s${s} w${w}: ${sentences[s][w]} = ${results[s][w]}`);
      }
    }
  }
})();
