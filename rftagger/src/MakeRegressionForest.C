
/*******************************************************************/
/*                                                                 */
/*     File: MakeRegressionForest.C                                */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul 18 10:58:08 2007                              */
/* Modified: Mon Jan 12 13:54:19 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <math.h>
#include <float.h>

#include "DataMapping.h"
#include "MakeRegressionForest.h"


/*******************************************************************/
/*                                                                 */
/*  compute_gain                                                   */
/*                                                                 */
/*******************************************************************/

static double compute_gain( ContTab &tab, Feature f )

{
  double p, p2, gain = 0.0;

  // entropy in all data
  size_t N = tab.freq.predicted + tab.freq.not_predicted;
  p = (double)tab.freq.predicted / (double)N;
  p2 = 1.0 - p;
  if (p > 0.0 && p2 > 0.0)
    gain -= p * log(p) + p2 * log(p2);

  // entropy in the data which passed the test
  p = tab.feat_prob[f];
  p2 = 1.0 - p;
  if (p > 0.0 && p2 > 0.0)
    gain += tab.test_prob[f] * (p * log(p) + p2 * log(p2));
  
  // entropy in the data which failed the test
  p = tab.comp_prob[f];
  p2 = 1.0 - p;
  if (p > 0.0 && p2 > 0.0)
    gain += (1.0 - tab.test_prob[f]) * (p * log(p) + p2 * log(p2));
  
  return (double)N * gain;
}


/*******************************************************************/
/*                                                                 */
/*  MakeRegressionForest::best_feature                             */
/*                                                                 */
/*******************************************************************/

int MakeRegressionForest::best_feature(ContTab &tab, Feature pf, size_t &nf,
				       int max_fpos, double &max_gain )
{
  int best_feat = -1;
  max_gain = 0.0;
  nf = 0;

  ///// compute the remaining entropy for each possible test /////////

  for( Feature f=0; f<fname.size(); f++ )
    if (feature_position[f] <= max_fpos && 
	tab.test_prob[f] > 0.0 && tab.test_prob[f] < 1.0)
      {
	double gain = compute_gain( tab, f );
	nf++;
	if (max_gain < gain) {
	  max_gain = gain;
	  best_feat = (int)f;
	}
	
	if (Verbose > 2)
	  fprintf(stderr,"feature %s entropy %g  best %s entropy %g\n", 
		  feature_name(f), gain, feature_name((Feature)best_feat), max_gain);
      }

  if (Verbose > 1) {
    if (best_feat > -1)
      fprintf(stderr,"best feature %s gain %g\n", 
	      feature_name((Feature)best_feat), max_gain);
    else if (Verbose > 2)
      fprintf(stderr,"no best feature\n");
  }

  return best_feat;
}


/*******************************************************************/
/*                                                                 */
/*  split_data                                                     */
/*                                                                 */
/*******************************************************************/

void split_data( Feature feat, vector<DataItem*> &data, 
		 vector<DataItem*> &yes_data, vector<DataItem*> &no_data )
{
  for( size_t i=0; i<data.size(); i++ )
    if (data[i]->has_feature(feat))
      yes_data.push_back( data[i] );
    else
      no_data.push_back( data[i] );
}


/*******************************************************************/
/*                                                                 */
/*  MakeRegressionForest::build_tree                               */
/*                                                                 */
/*******************************************************************/

DTNode *MakeRegressionForest::build_tree( vector<DataItem*> &data, Feature pf,
					  double parent_prob, int max_fpos )
{
  ContTab tab( data, pf, fname.size() );

  if (Verbose > 2)
    fprintf(stderr,"%lu %lu\n", (unsigned long)tab.freq.predicted, 
	    (unsigned long)tab.freq.not_predicted);

  ///// compute a smoothed probability estimate ///////////////////////
  double pred_prob;

  if (tab.freq.predicted == 0 || tab.freq.not_predicted == 0) {
    // smooth the probabilities
    pred_prob = ((double)tab.freq.predicted + parent_prob * SmoothingWeight) /
      ((double)(tab.freq.predicted + tab.freq.not_predicted) + SmoothingWeight);
    if (Verbose > 2)
      fprintf(stderr,"no ambiguity left\n");
  }
  else {
    size_t nf;

    // Maximum likelihood estimate
    pred_prob = (double)tab.freq.predicted / 
      (double)(tab.freq.predicted + tab.freq.not_predicted);

    double gain;
    int feat = best_feature( tab, pf, nf, max_fpos, gain );
    if (feat > -1 && gain > PruningThreshold) {
      if (feature_position[feat] == max_fpos)
	max_fpos++;

      ///// compute the two data subsets defined by the best test /////
      vector<DataItem*> yes_data;
      vector<DataItem*> no_data;
      split_data( (Feature)feat, data, yes_data, no_data );

      ///// recursively expand the regression tree //////////////

      DTNode *yes_node = build_tree(yes_data, pf, pred_prob, max_fpos);
      DTNode *no_node  = build_tree(no_data, pf, pred_prob, max_fpos);

      if (Verbose > 1)
	fprintf(stderr,"-> non-terminal node (prob %f)\n", pred_prob);

      ///// return a non-terminal node //////////////////////
      return new DTNode( (Feature)feat, yes_node, no_node);
    }
  }
  
  ///// return a leaf node //////////////////////////////////////////

  if (Verbose > 1)
    fprintf(stderr,"-> terminal node (prob %g)\n", pred_prob);

  return new DTNode( pred_prob );
}


/*******************************************************************/
/*                                                                 */
/*  MakeRegressionForest::add_tree                                 */
/*                                                                 */
/*******************************************************************/

void MakeRegressionForest::add_tree( vector<DataItem*> &data, Feature pf )

{
  if (Verbose)
    fprintf(stderr,"%u feature %s (%u items)\n", (unsigned)root.size(),
	    feature_name(pf), (unsigned)data.size());
  root.push_back( build_tree( data, pf, 0.5 ));
  if (Verbose > 1)
    fputc('\n', stderr);
}


/*******************************************************************/
/*                                                                 */
/*  MakeRegressionForest::MakeRegressionForest                     */
/*                                                                 */
/*******************************************************************/

MakeRegressionForest::MakeRegressionForest( DataMapping &map,
					    double prune, double smooth, 
					    bool all_feat, int v)
  : Verbose( v ),
    PruningThreshold( prune ), 
    SmoothingWeight( smooth ),
    AllFeatures( all_feat )
{
  map.copy_feature_names( fname );
  map.store_feature_positions( feature_position );
}
