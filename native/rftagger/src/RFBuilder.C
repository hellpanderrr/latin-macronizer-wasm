
/*******************************************************************/
/*                                                                 */
/*     File: RFBuilder.C                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed May 23 14:33:59 2007                              */
/* Modified: Wed Feb 11 12:59:47 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "RFBuilder.h"


/*******************************************************************/
/*                                                                 */
/*  RFBuilder::make_data                                           */
/*                                                                 */
/*******************************************************************/

void RFBuilder::make_data( Corpus &corpus )

{
  // convert a training corpus to a set of n-gram training items

  // for each sentence of the corpus
  for( size_t i=0; i<corpus.sentence.size(); i++ ) {
    Sentence &sent = corpus.sentence[i];

    vector<SymNum> tag;
    // add boundary tags
    for( size_t k=0; k<context_length; k++ )
      tag.push_back( corpus.boundary_tag() );
    // add the sentence tags
    for( size_t k=0; k<sent.token.size(); k++ )
      tag.push_back( sent.token[k].tag );
    // add another boundary tag
    tag.push_back( corpus.boundary_tag() );

    // build the feature vectors
    for( size_t k=context_length; k<tag.size(); k++ ) {
      vector<Feature> features;
      for( int l=(int)context_length; l>0; l-- ) {
	vector<Feature> &vec = datamapping.feature_vector(tag[k-l], l);
	features.insert(features.end(), vec.begin(), vec.end());
      }

      vector<Feature> &vec=datamapping.feature_vector(tag[k], 0);
      for( size_t l=0; l<vec.size(); l++ ) {
	Feature predicted_feature = vec[l];
	rfdata.add_item( features, predicted_feature );
	features.push_back( predicted_feature );
      }
    }
  }
}


/*******************************************************************/
/*                                                                 */
/*  build_subset                                                   */
/*                                                                 */
/*******************************************************************/

void build_subset( RFData &rfdata, vector<DataItem*> &datasubset, 
		   FeatureSet &possfeat )
{
  for( size_t i=0; i<rfdata.item.size(); i++ )
    if (possfeat.find(rfdata.item[i]->predicted_feature) != possfeat.end())
      datasubset.push_back(rfdata.item[i]);
}


/*******************************************************************/
/*                                                                 */
/*  RFBuilder::RFBuilder                                           */
/*                                                                 */
/*******************************************************************/

RFBuilder::RFBuilder( Corpus &corpus, size_t ContextLength, double prune, 
		      double smoothing, int Verbose)

  : context_length(ContextLength), 
    datamapping( (int)corpus.number_of_tags(), corpus.tagmap, ContextLength ),
    makeforest( datamapping, prune, smoothing, true, Verbose )

{
  // build a regression tree for each predicted feature

  if (Verbose)
    fprintf(stderr,"data preparation...");
  make_data( corpus );

  if (Verbose)
    fprintf(stderr,"finished\n");

  for( Feature pf=0; pf<datamapping.number_of_predicted_features; pf++) {
    FeatureSet &possfeat=datamapping.alternative_features( pf );
    vector<DataItem*> datasubset;
    build_subset( rfdata, datasubset, possfeat );
    makeforest.add_tree( datasubset, pf );
  }
}
