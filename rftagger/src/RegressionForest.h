
/*******************************************************************/
/*                                                                 */
/*     File: RegressionForest.h                                    */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed May 23 10:00:44 2007                              */
/* Modified: Wed Jun 24 10:38:01 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include <iostream>
using std::ostream;
using std::cerr;
using std::cout;

#include "io.h"
#include "SymbolTable.h"
#include "RFDataItem.h"

inline static void indentation( int n, FILE *file ) {
  for( int i=0; i<n; i++) 
    fputc( ' ', file );
}


/*****************  class DTTest  **********************************/

class DTTest {

public:
  Feature feature;

  bool result( RFDataItem &d ) { return d.exists_feature( feature ); }

  DTTest( Feature f ) : feature(f) {}

  DTTest( FILE *file ) {
    read_data( feature, file);
  }
  
  void store( FILE *file ) const {
    write_data( feature, file);
  }
};


/*****************  class DTNode  **********************************/

class DTNode {

public:
  DTTest test;
  double prob;
  DTNode *yes_subnode;
  DTNode *no_subnode;
  bool is_nonterminal;

  DTNode( double p ) : test((Feature)0), prob(p), is_nonterminal(false) {
    yes_subnode = no_subnode = NULL;
  }

  DTNode( Feature f, DTNode *tn, DTNode *fn ) : test(f), is_nonterminal(true) {
    yes_subnode  = tn;
    no_subnode = fn;
  }

  DTNode( FILE *file ) : test( file ) {
    read_data( is_nonterminal, file);
    if (is_nonterminal) {
      yes_subnode = new DTNode(file);
      no_subnode  = new DTNode(file);
    }
    else {
      read_data( prob, file);
      yes_subnode = no_subnode = NULL;
    }
  }

  ~DTNode() { 
    delete yes_subnode; 
    delete no_subnode;
  }

  void store( FILE *file ) const {
    test.store( file );
    write_data( is_nonterminal, file);
    if (is_nonterminal) {
      yes_subnode->store(file);
      no_subnode->store(file);
    }
    else
      write_data( prob, file);
  }

  void print( vector<char*> &fname, FILE *file, int indent ) {
    indentation( indent, file);
    if (is_nonterminal) {
      fprintf(file, "test feature = %s\n", fname[test.feature]);
      yes_subnode->print( fname, file, indent+2);
      indentation( indent, file);
      fprintf(file, "test feature != %s\n", fname[test.feature]);
      no_subnode->print( fname, file, indent+2);
    }
    else
      fprintf(file, "prob = %f\n", prob);
  }
};



/*****************  class RegressionForest  ************************/

class RegressionForest {

 protected:
  RegressionForest() {};
  vector<DTNode*> root;
  vector<char*> fname;

public:
  RegressionForest( FILE *file ) {
    uint64_t n;
    read_stringvec( fname, file);
    read_size( n, file);
    root.resize((size_t)n);
    for( size_t i=0; i<(size_t)n; i++ )
      root[i] = new DTNode( file );
  }
  
  ~RegressionForest() {
    for( size_t i=0; i<fname.size(); i++ )
      free(fname[i]);
    fname.clear();

    for( size_t i=0; i<root.size(); i++ )
      delete root[i];
    root.clear();
  }

  void store( FILE *file ) const {
    write_stringvec( fname, file);
    size_t n = root.size();
    write_data( n, file);
    for( size_t i=0; i<n; i++ )
      root[i]->store(file);
  }

  void print( FILE *file ) {
    for( SymNum i=0; i<root.size(); i++ ) {
      fprintf(file, "regression tree for predicted feature %s\n",
	      feature_name((Feature)i));
      root[i]->print( fname, file, 0 );
    }
  }

  const char *feature_name( Feature f ) { 
    assert( f < fname.size() );
    return fname[f];
  };

  double prob( RFDataItem &item ) {
    DTNode *n = root[item.predicted_feature];
    while (n->is_nonterminal) {
      if (n->test.result( item ))
	n = n->yes_subnode;
      else
	n = n->no_subnode;
    }
    return n->prob;
  }
};
