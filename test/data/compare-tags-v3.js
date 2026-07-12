// Paste into browser console at http://localhost:8080 AFTER Initialize completes.
// Creates a standalone RFTagger and compares against native output.
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

  const factory = window.RFTaggerModule;
  if (!factory) { console.error('RFTaggerModule missing'); return; }

  // loadModel(path, normalize, beamThreshold, sentStartHeuristic)
  // Native with -s: normalize=false, beamThreshold=0.001, sentStartHeuristic=true
  // Native without -s: normalize=true, beamThreshold=0.001, sentStartHeuristic=false
  // Our TS: normalize=true, beamThreshold=0.001, sentStartHeuristic=true

  async function testConfig(label, normalize, sentStart) {
    const mod = await factory({locateFile: p => '/wasm/' + p});
    await mod.ready;
    const t = new mod.RFTagger();
    t.loadModel('/models/rftagger-ldt.model', normalize, 0.001, sentStart);
    const results = [];
    for (const s of sentences) { results.push(t.tagTokens(s)); }
    t.delete();
    return results;
  }

  // Test both configs
  console.log('Test A: normalize=true sentStart=true (current TS)');
  const rA = await testConfig('A', true, true);

  console.log('Test B: normalize=false sentStart=true (matches native -s)');
  const rB = await testConfig('B', false, true);

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

  for (const [label, results] of [['A (norm+, start+)', rA], ['B (norm-, start+)', rB]]) {
    console.log(`\n=== ${label} ===`);
    let m = 0;
    for (const t of targets) {
      const wt = results[t.s][t.i];
      const nt = nativeTags[t.w];
      const ok = wt === nt;
      if (ok) m++;
      console.log(`${ok?'✓':'✗'} ${t.w} WASM=${wt} Native=${nt}`);
    }
    console.log(`Match: ${m}/${targets.length}`);
  }
})();
