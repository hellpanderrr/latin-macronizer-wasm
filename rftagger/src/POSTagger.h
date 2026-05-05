
/*******************************************************************/
/*                                                                 */
/*     File: POSTagger.h                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul  4 13:58:07 2007                              */
/* Modified: Thu Jul 26 17:14:25 2012 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "Prob.h"
#include "Lexicon.h"
#include "Guesser.h"
#include "DataMapping.h"
#include "RegressionForest.h"


/*****************  class Node  ************************************/

class Node {

 public:
   SymNum tag;
   double prob;
   size_t prev;

  Node( SymNum t, double p, size_t n ) : tag(t), prob(p), prev(n) {}

  void print( FILE *file=stdout ) {
    fprintf(file, "%d %g %lu\n", tag, prob, (unsigned long)prev);
  }
};


/*****************  class POSTagger  *******************************/

class POSTagger {

  vector<Node> node;
  vector<size_t> active_node;
  vector<size_t> new_active;

  static const SymNum boundary_tag=0;
  Entry boundary_entry;

  Node &preceding_node( Node &n ) { return node[n.prev]; }
  void init_trellis();
  int context_cmp( Node &node1, Node &node2, size_t pos=0 );
  void add_node( Node &new_node );
  void build_feature_vector( Node *node, RFDataItem &item );
  void extend_node( size_t nodeid, SymNum tag, Prob lexprob );
  void extend_trellis( Entry& );
  void store_tags( Sentence &sent, Node &node, size_t pos );

  double transition_prob( Node& );
  double transition_prob_norm_const( Node& );

 public:
  bool Normalize;
  bool SentStartHeuristic;
  bool HyphenationHeuristic;
  Prob BeamThreshold;
  Prob MaxProb;
  SymbolTable tagmap;   // maps the POS name to a number
  Lexicon lexicon;      // returns the possible tag numbers and 
                        // tag probabilities for a word
  Guesser guesser;      // returns the possible tag numbers and 
                        // probabilities for an UNKNOWN word
  DataMapping datamapping; // maps tag numbers to feature vectors
  RegressionForest forest; // returns the transition probabilities
  size_t contextlength;    // number of preceding tags on which the
                           // transition probabilities depend
  const char* current_word; // for debug: current word being processed

  // reads a tagger from a binary file
 POSTagger( FILE *file, bool norm=false, double t=0.0, bool ss=false, bool h=false )
 : Normalize(norm), SentStartHeuristic(ss), HyphenationHeuristic(h), BeamThreshold(t), 
   tagmap( file ), lexicon( file ), guesser( file ), datamapping( file ), 
   forest( file )
 {
   uint64_t n;
   read_size( n, file );
   contextlength = (size_t)n;
   boundary_entry.add_tag( boundary_tag );
   boundary_entry.tag[0].prob = 1.0;
   current_word = nullptr;
 }

  // maps a POS name to the respective number
  SymNum POSnumber( const char *s ) {
    SymNum result;
    if (!tagmap.lookup(s, result))
      errx(1,"Error: unknown POS tag \"%s\"!\n", s);
    return result;
  }

  const char *POSname( SymNum tag ) {
    if (tagmap.size() <= tag)
      errx(1,"Error: POS tag number out of range: %u\n", tag);
    return tagmap.name(tag);
  }

  // annotate a sentence with POS tags
  void annotate( Sentence& );

  // reset internal state between sentences (important for WASM)
  void resetState() {
    node.clear();
    node.shrink_to_fit();
    active_node.clear();
    active_node.shrink_to_fit();
    new_active.clear();
    new_active.shrink_to_fit();
  }

  // prints the tagger parameters and human-readable form
  void print( FILE *file );

  Entry &lookup( const char *word, bool sstart=false );
};
