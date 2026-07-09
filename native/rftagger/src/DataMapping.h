
/*******************************************************************/
/*                                                                 */
/*     File: DataMapping.h                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul  4 16:36:30 2007                              */
/* Modified: Wed Jun 24 10:39:05 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include <assert.h>

#include "SymbolTable.h"
#include "Feature.h"


/*****************  class DataMapping  *****************************/

class DataMapping {

 private:
  size_t _number_of_tags;
  size_t _contextlength; // order of the Markov model

  SymbolTable DTfeature; // assigns numbers to DT features such as 1.N.pl

  vector<vector<vector<Feature> > > featvec_for_cposPOS; // maps a
  // context position and a POS tag to a feature vector

  vector<FeatureSet> featset; // the set of (competing) feature sets

  vector<FeatureSet*> featset_for_feature; // maps a feature to the set
  // of competing features including the feature itself
				    
  void add_feature( size_t pos, size_t tag_num, char *cat, 
		    char *feat=NULL, int fpos=0 );
  void make_cposPOS_mapping( SymbolTable& );
  void make_feature_sets( SymbolTable& );
  void make_featset_for_feature_mapping();
  void create_mappings( SymbolTable &tagmap ) { 
    make_cposPOS_mapping( tagmap ); 
    make_feature_sets( tagmap );
    make_featset_for_feature_mapping();
  }
  
 public:
  size_t number_of_predicted_features;

  DataMapping( int n, SymbolTable &tagmap, size_t l ) {
    _contextlength=l;
    _number_of_tags = n;
    create_mappings( tagmap );
  }

  DataMapping( FILE *file );

  void copy_feature_names( vector<char*> &fname ) {
    fname.resize(DTfeature.size());
    for( SymNum i=0; i<DTfeature.size(); i++ )
      fname[i] = strdup(DTfeature.name(i));
  }

  const char *DTfeature_name( SymNum n ) {
    // returns the name for a given regression tree feature number
    return DTfeature.name( n );
  }

  vector<Feature> &feature_vector( SymNum tag, int context_pos=0 ) {
    // maps a context position and a POS tag to a vector of 
    // regression tree features
    return featvec_for_cposPOS[context_pos][tag];
  }

  FeatureSet &alternative_features( Feature f ) {
    // returns the set of possible regression tree features
    // for a given POS tag and feature position
    assert(featset_for_feature[f] != NULL);
    return *featset_for_feature[f];
  }

  size_t number_of_RFfeatures() { return DTfeature.size(); }

  void store_feature_positions( vector<int> &fpos );

  void store( FILE *file );
};
