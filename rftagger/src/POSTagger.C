
/*******************************************************************/
/*                                                                 */
/*     File: POSTagger.C                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul  4 16:12:33 2007                              */
/* Modified: Tue Apr 30 17:56:47 2013 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "POSTagger.h"
#include <cstring>

#define DEBUG_NATIVE  // Enable debug output for tag probability inspection

/*******************************************************************/
/*                                                                 */
/*  POSTagger::print                                               */
/*                                                                 */
/*******************************************************************/

void POSTagger::print( FILE *file )

{
  lexicon.print( tagmap, file );
  
  fprintf(file,"\nPOS tag probabilities for each class of unknown words\n");
  fprintf(file,"-----------------------------------------------------\n");
  guesser.print( tagmap, file );
  
  fprintf(file,"\nRegression forests for the transition probabilities\n");
  fprintf(file,"---------------------------------------------------\n");
  forest.print(  file  );
}


/*******************************************************************/
/*                                                                 */
/*  is_lowercase                                                   */
/*                                                                 */
/*******************************************************************/

static bool is_lowercase( char c )
 
{
  // Simplified for ASCII; original included extended characters causing build issues
  return (c >= 'a' && c <= 'z');
}


/*******************************************************************/
/*                                                                 */
/*  is_uppercase                                                   */
/*                                                                 */
/*******************************************************************/

static bool is_uppercase( char c )
 
{
  // Simplified for ASCII; original included extended characters causing build issues
  return (c >= 'A' && c <= 'Z');
}


/*******************************************************************/
/*                                                                 */
/*  lowercase                                                      */
/*                                                                 */
/*******************************************************************/

static char *lowercase( const char *word )

{
  if (is_uppercase(word[0])) {
    static char buffer[1001];
    buffer[1000] = 0;
    buffer[0] = (char)(word[0] + 32);
    for( size_t i=1; i<1000; i++ ) {
      buffer[i] = word[i];
      if (word[i] == 0)
	return buffer;
      if (!is_lowercase(word[i]))
	return NULL;
    }
  }
  return NULL;
}


/*******************************************************************/
/*                                                                 */
/*  merge_entries                                                  */
/*                                                                 */
/*******************************************************************/

static Entry &merge_entries( const Entry &e1, const Entry &e2 )

{
  static Entry result;
  result.tag.clear();
  size_t i=0, k=0;
  double w1, w2;
  if (e1.freq == 0.0 && e2.freq == 0.0)
    w1 = w2 = 0.5;
  else {
    w1 = e1.freq / (e1.freq + e2.freq);
    w2 = e2.freq / (e1.freq + e2.freq);
  }

  while (i < e1.tag.size() || k < e2.tag.size()) {
    if (i < e1.tag.size() && (k == e2.tag.size() || e1.tag[i] < e2.tag[k])) {
      result.tag.push_back( e1.tag[i++] );
      result.tag.back().prob *= (float)w1;
    }
    else if (k<e2.tag.size() && (i == e1.tag.size() || e2.tag[k] < e1.tag[i])) {
      result.tag.push_back( e2.tag[k++] );
      result.tag.back().prob *= (float)w2;
    }
    else {
      result.tag.push_back( e1.tag[i] );
      result.tag.back().prob = 
	(float)(e1.tag[i++].prob * w1 + e2.tag[k++].prob * w2);
    }
  }
  return result;
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::lookup                                              */
/*                                                                 */
/*******************************************************************/

Entry &POSTagger::lookup( const char *word, bool sstart )
 
{
  Entry *entry = lexicon.lookup( word );
  
  // Debug: log entry tags for specific problematic words (WASM ONLY - comment out for native)
  // To enable for native, add: -DDEBUG_NATIVE to compilation
  #ifdef DEBUG_NATIVE
  if (entry && (strcmp(word, "omnis")==0 || strcmp(word, "aliam")==0 || strcmp(word, "lingua")==0 || strcmp(word, "nostra")==0)) {
      fprintf(stderr, "[DEBUG] POSTagger::lookup: word='%s', entry=%p, tag count=%zu\n",
              word, entry, entry->tag.size());
      for (size_t i = 0; i < entry->tag.size(); i++) {
          Tag &t = entry->tag[i];
          const char* tagname = tagmap.name(t.number);
          double prior = lexicon.prior_prob(t.number);
          fprintf(stderr, "[DEBUG]   tag %u (%s): emit_prob=%.6f, prior=%.6f, lexprob=%.6f\n",
                  t.number, tagname ? tagname : "???", t.prob, prior, t.prob/prior);
      }
      // Print feature vectors for each tag (context position 0)
      for (size_t i = 0; i < entry->tag.size(); i++) {
          Tag &t = entry->tag[i];
          vector<Feature> &fv = datamapping.feature_vector(t.number, 0);
          fprintf(stderr, "[DEBUG]   featvec for tag %u (size=%zu):", t.number, fv.size());
          for (size_t j = 0; j < fv.size(); j++) {
              fprintf(stderr, " %u", fv[j]);
          }
          fprintf(stderr, "\n");
      }
      fflush(stderr);
  }
  #endif

  char *lword;

  // If "Token" appears at the beginning of a sentence,
  // then look up "token", as well.
  if (SentStartHeuristic && sstart && (lword = lowercase( word )) != NULL) {
    if (entry) {
      Entry *entry2 = lexicon.lookup( lword );
      if (entry2)
	// "Token" and "token" both appeared in the lexicon
	return merge_entries( *entry, *entry2 );
      // Only "Token" appeared in the lexicon
      return *entry;
    }

    Entry *entry2 = lexicon.lookup( lword );
    if (entry2)
      // Only "token" appeared in the lexicon
      return *entry2;

    // Neither "Token" nor "token" appeared in the lexicon
    return merge_entries( guesser.lookup( word ), guesser.lookup( lword ) );
  }
  
  if (entry)
    return *entry;

  if (HyphenationHeuristic) {
    const char *word2 = NULL;
    for( const char *p=word; *p; p++ )
      if (p > word && *p == '-' && *(p+1))
	word2 = p;
    if (word2) {
      Entry *entry = lexicon.lookup( word2 );
      if (entry)
	return *entry;
    }
  }

  return guesser.lookup( word );
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::build_feature_vector                                */
/*                                                                 */
/*******************************************************************/

void POSTagger::build_feature_vector( Node *n, RFDataItem &item )

{
  // build the feature vector
  for( size_t i=0; i<=contextlength; i++ ) {
    item.add_features( datamapping.feature_vector(n->tag, (int)i));
    n = &node[n->prev];
  }
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::transition_prob                                     */
/*                                                                 */
/*******************************************************************/

double POSTagger::transition_prob( Node &new_node )

{
  RFDataItem item( datamapping.number_of_RFfeatures() );
  build_feature_vector( &new_node, item );
  
  // multiply the conditional probabilities of the tag components
  vector<Feature> &vec=datamapping.feature_vector(new_node.tag, 0);
  double prob=1.0;
  for( size_t l=0; l<vec.size(); l++ ) {
    item.predicted_feature = vec[l];
    prob *= forest.prob(item);
  }

  return prob;
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::transition_prob_norm_const                          */
/*                                                                 */
/*******************************************************************/

double POSTagger::transition_prob_norm_const( Node &new_node )

{
  // build the feature vector
  RFDataItem item( datamapping.number_of_RFfeatures() );
  build_feature_vector( &new_node, item );
  
  // multiply the conditional probabilities of the tag components
  vector<Feature> &vec=datamapping.feature_vector(new_node.tag, 0);
  double result=1.0;
  for( size_t l=0; l<vec.size(); l++ ) {
    // compute the normalisation constant
    FeatureSet &possfeat=datamapping.alternative_features( vec[l] );
    double sum=0.0;
    for( FeatureSet::iterator it=possfeat.begin(); it!=possfeat.end(); it++) {
      item.predicted_feature = *it;
      double p2 = forest.prob( item );
      sum += p2;
    }
    result *= sum;
  }

  return result;
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::context_cmp                                         */
/*                                                                 */
/*******************************************************************/

int POSTagger::context_cmp( Node &node1, Node &node2, size_t pos )

{
  if (pos == contextlength)
    return 0;
  if (node1.tag < node2.tag)
    return -1;
  if (node1.tag > node2.tag)
    return 1;
  return context_cmp( preceding_node(node1), preceding_node(node2), pos+1 );
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::add_node                                            */
/*                                                                 */
/*******************************************************************/

void POSTagger::add_node( Node &new_node )

{
  // find insertion position
  size_t l=0;
  size_t r=new_active.size();
  while (l < r) {
    size_t m = (l + r) >> 1;
    if (context_cmp(node[new_active[m]], new_node) < 0)
      l = m+1;
    else
      r = m;
  }

  // check whether there is a node with the same context
  if (l < new_active.size()) {
    Node &old_node = node[new_active[l]];
    if (context_cmp(old_node, new_node) == 0) {
      // replace the old node if its probability is lower
      if (old_node.prob < new_node.prob)
	old_node = new_node;
      return;
    }
  }

  // add a new node if a node with the same context does not exist
  new_active.push_back( 0 );
  for( size_t i=new_active.size()-1; i>l; i-- )
    new_active[i] = new_active[i-1];
  new_active[l] = node.size();
  node.push_back( new_node );
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::extend_node                                         */
/*                                                                 */
/*******************************************************************/

void POSTagger::extend_node( size_t nodeid, SymNum tag, Prob lexprob )

{
  Node &old_node = node[nodeid];
  Prob p = old_node.prob * lexprob;
  if (p < MaxProb * BeamThreshold)
    return;

  Node new_node( tag, (Prob)1.0, nodeid );
  double trans_prob = transition_prob(new_node);
  new_node.prob = p * (Prob)trans_prob;

  double norm = 1.0;
  if (Normalize) {
    norm = transition_prob_norm_const(new_node);
    new_node.prob /= (Prob)norm;
  }

  if (new_node.prob > MaxProb * BeamThreshold) {
    add_node( new_node );
    if (MaxProb < new_node.prob)
      MaxProb = new_node.prob;
  }

  // Debug output for specific words
  if (current_word && (strcmp(current_word, "omnis")==0 || strcmp(current_word, "aliam")==0 || strcmp(current_word, "lingua")==0 || strcmp(current_word, "nostra")==0)) {
    const char* tagname = tagmap.name(tag);
    fprintf(stderr, "[DEBUG] extend_node: word=%s, tag=%u (%s), lexprob_lin=%g, trans_prob_lin=%g",
            current_word, (unsigned)tag, tagname ? tagname : "???", (double)lexprob, trans_prob);
    if (Normalize) {
      fprintf(stderr, ", norm_lin=%g", norm);
    }
    fprintf(stderr, ", final_prob_lin=%g\n", (double)new_node.prob);
  }
}


/*******************************************************************/
/*                                                                 */
/*  POSTagger::extend_trellis                                      */
/*                                                                 */
/*******************************************************************/

void POSTagger::extend_trellis( Entry &entry )

{
  MaxProb = 0.0;
  for( size_t i=0; i<entry.tag.size(); i++ ) {
    SymNum t = entry.tag[i].number;
    Prob p(entry.tag[i].prob / lexicon.prior_prob(t));

    for( size_t k=0; k<active_node.size(); k++ )
      extend_node( active_node[k], t, p );
  }
  active_node.swap(new_active);
  new_active.clear();

  size_t k=0;
  for( size_t i=0; i<active_node.size(); i++ ) {
    Node &n = node[active_node[i]];
    if (n.prob > MaxProb * BeamThreshold)
      active_node[k++] = active_node[i];
  }

  active_node.resize(k);
  assert(active_node.size() > 0);

  // Move the most probable analysis to the top
  size_t best = 0;
  for( size_t i=1; i<active_node.size(); i++ )
    if (node[active_node[best]].prob < node[active_node[i]].prob)
      best = i;
  size_t tmp = active_node[0];
  active_node[0] = active_node[best];
  active_node[best] = tmp;
}



/*******************************************************************/
/*                                                                 */
/*  POSTagger::store_tags                                          */
/*                                                                 */
/*******************************************************************/

void POSTagger::store_tags( Sentence &sent, Node &n, size_t pos )

{
  if (pos-- > 0) {
    sent.token[pos].tag = n.tag;
    store_tags( sent, preceding_node(n), pos );
  }
}



/*******************************************************************/
/*                                                                 */
/*  POSTagger::init_trellis                                        */
/*                                                                 */
/*******************************************************************/

void POSTagger::init_trellis()

{
  active_node.clear();
  new_active.clear();
  node.clear();

  // initialize the Viterbi trellis
  for( size_t i=0; i<contextlength; i++ )
    node.push_back( Node(boundary_tag, 1.0, (long)node.size()-1) );

  node[0].prev = 0;
  active_node.push_back( node.size()-1 );
}



/*******************************************************************/
/*                                                                 */
/*  POSTagger::annotate                                            */
/*                                                                 */
/*******************************************************************/

void POSTagger::annotate( Sentence &sent )

{
  init_trellis();

  // build the trellis
  bool sstart = true;
  for( size_t i=0; i<sent.token.size(); i++ ) {
    char *w = sent.token[i].word;
    current_word = w;
    extend_trellis( lookup(w, sstart) );

    if (sstart && strcmp(w,"(") != 0 && strcmp(w,"``") != 0 &&
	strcmp(w,"\"") != 0 && strcmp(w,",,") != 0 &&
	strcmp(w,"--") != 0 && strcmp(w,"-") != 0)
      sstart = false;
  }
  extend_trellis( boundary_entry );

  // find the active node with the highest probability
  Node &best_node = node[active_node[0]];
  for( size_t i=1; i<active_node.size(); i++ ) {
    Node &n = node[active_node[i]];
    if (best_node.prob < n.prob)
      best_node = n;
  }

  // store the Viterbi tags
  store_tags( sent, preceding_node(best_node), (int)sent.token.size() );
}
