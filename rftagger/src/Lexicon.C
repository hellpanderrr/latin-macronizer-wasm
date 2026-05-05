
/*******************************************************************/
/*                                                                 */
/*     File: Lexicon.C                                             */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jun 14 16:39:01 2007                              */
/* Modified: Wed Jun 24 10:38:59 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "Lexicon.h"


/*******************************************************************/
/*                                                                 */
/*  Lexicon::compute_priors                                        */
/*                                                                 */
/*******************************************************************/

void Lexicon::compute_priors( Corpus &corpus )

{
  // count the tags
  vector<size_t> freq(corpus.number_of_tags(), 1);
  for( size_t i=0; i<corpus.sentence.size(); i++ ) {
    Sentence &sent = corpus.sentence[i];
    freq[corpus.boundary_tag()]++;
    for( size_t k=0; k<sent.token.size(); k++ )
      freq[sent.token[k].tag]++;
  }
  
  size_t N=0;
  for( size_t i=0; i<freq.size(); i++ )
    N += freq[i];

  PriorProb.resize(freq.size());
  for( size_t t=0; t<freq.size(); t++ )
    PriorProb[t] = (double)freq[t] / (double)N;
}


/*******************************************************************/
/*                                                                 */
/*  Lexicon::Lexicon                                               */
/*                                                                 */
/*******************************************************************/

Lexicon::Lexicon( Corpus &corpus, Sentence *wordlist )

{
  compute_priors( corpus );

  ///// create lexicon entries /////////////////////////////////////

  // extract the list of words from the training corpus
  for( size_t i=0; i<corpus.sentence.size(); i++ ) {
    Sentence &sent = corpus.sentence[i];
    for( size_t k=0; k<sent.token.size(); k++ )
      add_word_and_tag( sent.token[k].word, sent.token[k].tag );
  }
  
  if (wordlist != NULL) {
    // add words from the supplementary list
    for( size_t i=0; i<wordlist->token.size(); i++ )
      add_word_and_tag( wordlist->token[i].word, wordlist->token[i].tag );
  }
  
  ///// add the frequency information //////////////////////////////

  // compute tag frequencies from the training corpus
  for( size_t i=0; i<corpus.sentence.size(); i++ ) {
    Sentence &sent = corpus.sentence[i];
    for( size_t k=0; k<sent.token.size(); k++ )
      increment_tag_count(sent.token[k].word, sent.token[k].tag);
  }

  // estimate the probabilities
  for( size_t i=0; i<entry.size(); i++ )
    // The tags are sorted in the next step
    entry[i].estimate_tag_probs( 0.0, &PriorProb ); // smooth the probabilities
}
