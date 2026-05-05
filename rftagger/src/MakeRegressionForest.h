
/*******************************************************************/
/*                                                                 */
/*     File: MakeRegressionForest.h                                */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul 18 10:27:01 2007                              */
/* Modified: Mon Jan 12 13:48:45 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef MAKE_REGRESSION_FOREST_H
#define MAKE_REGRESSION_FOREST_H

#include "DataItem.h"
#include "RegressionForest.h"


/*****************  class FPair  ***********************************/

class FPair {
public:
  size_t predicted, not_predicted;
  FPair() { predicted = not_predicted = 0; }
};


/*****************  class ContTab  *********************************/

class ContTab {
public:
  // frequency of the predicted feature and of all competing features
  FPair freq;
  // frequency of positive and negative test outcomes
  vector<FPair>  feat_freq;
  // probability of each test feature 
  vector<double> test_prob;
  // probability of the predicted feature if the test feature is present
  vector<double> feat_prob;
  // probability of the predicted feature if the test feature is absent
  vector<double> comp_prob;

  ContTab( vector<DataItem*> &data, Feature pf, size_t nof ) {
    feat_freq.resize( nof );
    test_prob.resize( nof );
    feat_prob.resize( nof );
    comp_prob.resize( nof );

    for( size_t i=0; i<data.size(); i++ ) {
      DataItem *d=data[i];
      if (d->predicted_feature == pf) {
	freq.predicted += d->freq;
	for( size_t k=0; k<d->feature.size(); k++ )
	  feat_freq[d->feature[k]].predicted += d->freq;
      }
      else {
	freq.not_predicted += d->freq;
	for( size_t k=0; k<d->feature.size(); k++ )
	  feat_freq[d->feature[k]].not_predicted += d->freq;
      }
    }

    // estimate the probability of the predicted feature
    // for each test feature
    
    size_t N = freq.predicted + freq.not_predicted;
    for( size_t f=0; f<nof; f++ ) {
      size_t sum = feat_freq[f].predicted + feat_freq[f].not_predicted;
      test_prob[f] = (double)sum / (double)N;
      feat_prob[f] = (double)feat_freq[f].predicted / (double)sum;
      comp_prob[f] =
	(double)(freq.predicted - feat_freq[f].predicted) / (double)(N - sum);
    }
  }
};


/*****************  class MakeRegressionForest  ********************/

class MakeRegressionForest : public RegressionForest {

private:
  int    Verbose;
  double PruningThreshold;
  double SmoothingWeight;
  bool   AllFeatures;

  void compute_feature_positions( DataMapping &map );

  int best_feature( ContTab&, Feature pf, size_t &nof, int fpos, double &gain );

  DTNode *build_tree( vector<DataItem*>&, Feature pf, double pprob, int pos=1);

  vector<int> feature_position; // position of a feature

public:

  MakeRegressionForest( DataMapping &map, double PruningThreshold, 
			double SmoothingWeight, bool AllFeatures, int Verbose );

  void add_tree( vector<DataItem*> &data, Feature pf );


};

#endif
