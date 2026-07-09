
/*******************************************************************/
/*                                                                 */
/*     File: DataMapping.C                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul  4 16:37:58 2007                              */
/* Modified: Wed Jun 24 10:39:17 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "io.h"
#include "DataMapping.h"


/*******************************************************************/
/*                                                                 */
/*  DataMapping::store_feature_positions                           */
/*                                                                 */
/*******************************************************************/

void DataMapping::store_feature_positions( vector<int> &fpos )

{
  fpos.resize( number_of_RFfeatures() );
  for( SymNum i=0; i<featvec_for_cposPOS.size(); i++ )
    for( size_t k=0; k<featvec_for_cposPOS[i].size(); k++ ) {
      vector<Feature> &vec = featvec_for_cposPOS[i][k];
      for( size_t l=0; l<vec.size(); l++ )
	fpos[vec[l]] = i;
    }
}



/*******************************************************************/
/*                                                                 */
/*  DataMapping::add_feature                                       */
/*                                                                 */
/*******************************************************************/

void DataMapping::add_feature( size_t pos, size_t tag_num, 
			       char *cat, char *feat, int fpos )
{
  // build a feature name such as N.sg
  char buffer[1000];
  char *p=buffer;
  p += sprintf(p, "%s", cat);
  if (feat != NULL)
    p += sprintf(p,".%s(%d)", feat, fpos);
  
  sprintf(p, ".%ld", (long)pos); // complete the feature name to N.sg.1, for instance
  Feature f = (Feature)DTfeature.number(buffer);  // map the feature name to a number
  featvec_for_cposPOS[pos][tag_num].push_back( f );    // and store the number
}


/*******************************************************************/
/*                                                                 */
/*  DataMapping::make_cposPOS_mapping                              */
/*                                                                 */
/*******************************************************************/

void DataMapping::make_cposPOS_mapping( SymbolTable &tagmap )

{
  // create the two-dimensional array for mapping a
  // context position/POS number pair to a feature vector
  featvec_for_cposPOS.resize(_contextlength+1);
  for( size_t i=0; i<=_contextlength; i++ )
    featvec_for_cposPOS[i].resize(_number_of_tags);

  // Scan the list of POS tags and create the feature vectors
  char buffer[1000];
  for( size_t i=0; i<=_contextlength; i++ ) {
    for( SymNum tag=0; tag<_number_of_tags; tag++ ) {
      char *s = buffer;
      strcpy(s, tagmap.name(tag));
      
      // main POS category
      char *feat, *cat = strtok(s, ".");
      if (cat == NULL || cat[0] == 0) {
	fprintf(stderr,"Erroneous POS tag: %s\n", tagmap.name(tag));
	exit(1);
      }
      add_feature( i, tag, cat );
      
      // other features
      for( int k=0; (feat = strtok( NULL, ".")); k++ ) {
	if (feat == NULL || feat[0] == 0) {
	  fprintf(stderr,"Erroneous POS tag: %s\n", tagmap.name(tag));
	  exit(1);
	}
	add_feature( i, tag, cat, feat, k );
      }
    }
    if (i == 0)
      number_of_predicted_features = DTfeature.size();
  }
}


/*******************************************************************/
/*                                                                 */
/*  DataMapping::make_feature_sets                                 */
/*                                                                 */
/*******************************************************************/

void DataMapping::make_feature_sets( SymbolTable &tagmap )

{
  SymbolTable categories;  // maps major POS categories to numbers
  vector<vector<FeatureSet > > featset_for_catfpos;

  // for all part-of-speech tags
  char buffer[1000];
  for( SymNum tagnum=0; tagnum<_number_of_tags; tagnum++ ) {
    // extract the major category and assign a number to it
    strcpy(buffer, tagmap.name(tagnum));
    char *cat = strtok(buffer, ".");
    if (cat == NULL || cat[0] == 0) {
      fprintf(stderr,"Erroneous POS tag: %s\n", tagmap.name(tagnum));
      exit(1);
    }
    SymNum catnum = categories.number(cat);

    // get the feature vector for this POS tag
    vector<Feature> &fvec = feature_vector( tagnum );
    // resize the array if needed
    if (catnum == featset_for_catfpos.size()) {
      featset_for_catfpos.resize(catnum+1);
      featset_for_catfpos[catnum].resize(fvec.size());
    }

    // check whether the number of features of the current POS tag differs
    // from the number of features of a previous POS tag of the same category
    // such as DT.sg.masc and DT.pl
    else if (featset_for_catfpos[catnum].size() != fvec.size())
      errx(1, "Error: varying number of features for category \"%s\": %s", 
	   cat, tagmap.name(tagnum));

    // store the features in the respective sets of possible features
    // for all feature positions
    featset_for_catfpos[0][0].insert(fvec[0]);
    for( size_t pos=1; pos<fvec.size(); pos++ )
      featset_for_catfpos[catnum][pos].insert(fvec[pos]);
  }

  featset.push_back(featset_for_catfpos[0][0]);
  for( size_t i=0; i<featset_for_catfpos.size(); i++ )
    for( size_t k=1; k<featset_for_catfpos[i].size(); k++ )
      featset.push_back(featset_for_catfpos[i][k]);
}


/*******************************************************************/
/*                                                                 */
/*  DataMapping::make_featset_for_feature_mapping                  */
/*                                                                 */
/*******************************************************************/

void DataMapping::make_featset_for_feature_mapping()

{
  // create a table which maps each regression tree feature f 
  // to the set of competing features which includes f

  featset_for_feature.resize(number_of_RFfeatures(), NULL);
  for( size_t i=0; i<featset.size(); i++ ) {
    FeatureSet &s = featset[i];
    for( FeatureSet::iterator it=s.begin(); it!=s.end(); it++ ) {
      Feature f=*it;
      assert(f < number_of_RFfeatures());
      featset_for_feature[f] = &s;
    }
  }
}


/*******************************************************************/
/*                                                                 */
/*  DataMapping::DataMapping                                       */
/*                                                                 */
/*******************************************************************/

DataMapping::DataMapping( FILE *file )

  : DTfeature( file )

{
  uint64_t temp;
  read_size( temp, file ); _number_of_tags = (size_t)temp;
  read_size( temp, file ); _contextlength = (size_t)temp;
  read_size( temp, file ); number_of_predicted_features = (size_t)temp;

  featvec_for_cposPOS.resize( _contextlength+1 );
  for( size_t i=0; i<=_contextlength; i++ ) {
    featvec_for_cposPOS[i].resize( _number_of_tags );
    for( size_t k=0; k<_number_of_tags; k++ )
      read_basedatavec( featvec_for_cposPOS[i][k], file );
  }

  uint64_t N;
  read_size( N, file );
  featset.resize( (size_t)N );

  for( size_t i=0; i<(size_t)N; i++ ) {
    FeatureSet &s=featset[i];
    uint64_t n;
    read_size( n, file );
    for( size_t k=0; k<n; k++ ) {
      Feature f;
      read_data( f, file );
      s.insert(f);
    }
  }

  make_featset_for_feature_mapping();
}


/*******************************************************************/
/*                                                                 */
/*  DataMapping::store                                             */
/*                                                                 */
/*******************************************************************/

void DataMapping::store( FILE *file )

{
  DTfeature.store(file);
  write_data( _number_of_tags, file);
  write_data( _contextlength, file );
  write_data( number_of_predicted_features, file );

  for( size_t i=0; i<=_contextlength; i++ )
    for( size_t k=0; k<_number_of_tags; k++ )
      write_basedatavec( featvec_for_cposPOS[i][k], file );

  size_t N = featset.size();
  write_data( N, file );
  for( size_t i=0; i<N; i++ ) {
    FeatureSet &s=featset[i];
    size_t n = s.size();
    write_data( n, file );
    for( FeatureSet::iterator it=s.begin(); it!=s.end(); it++ ) {
      Feature f=*it;
      write_data( f, file );
    }
  }
}
