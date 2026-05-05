
/*******************************************************************/
/*                                                                 */
/*     File: Entry.C                                               */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jun 14 16:39:01 2007                              */
/* Modified: Wed Feb 11 12:53:37 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <algorithm>

#include "Entry.h"


/*******************************************************************/
/*                                                                 */
/*  Entry::estimate_tag_probs                                      */
/*                                                                 */
/*******************************************************************/

void Entry::estimate_tag_probs( double MinProb, vector<double> *prior )

{
  // compute the maximal tag frequency, the word frequency, 
  // and the number of observed tags
  unsigned maxfreq = 0;
  unsigned sum = 0;
  unsigned int observed=0;
  for( size_t i=0; i<tag.size(); i++ ) {
    unsigned f = tag[i].freq;
    if (f > 0) {
      sum += f;
      observed++;
    }
    if (maxfreq < f)
      maxfreq = f;
  }
  freq = (float)sum;
  double minfreq = maxfreq * MinProb;


  // Compute a probability distribution for smoothing

  vector<double> pp(tag.size());
  if (prior) {
    // scale the prior probabilities so that they sum up to 1
    // for the possible tags of the current entry
    double psum = 0.0;
    for( size_t i=0; i<tag.size(); i++ ) {
      pp[i] = (*prior)[tag[i].number];
      psum += pp[i];
    }
    for( size_t i=0; i<tag.size(); i++ )
      pp[i] /= psum;
  }
  else {
    // Define a uniform probability distribution
    for( size_t i=0; i<tag.size(); i++ )
      pp[i] = 1.0 / (double)tag.size();
  }

  // estimate the tag probabilities

  // unobserved word?
  if (sum == 0)
    // uniform tag probability distribution
    for( size_t i=0; i<tag.size(); i++ )
      tag[i].prob = (float)pp[i];

  // pruning required?
  else if (minfreq >= 1.0) {

    // eliminate tags with a frequency below the threshold
    sum = 0;
    size_t k=0;
    for( size_t i=0; i<tag.size(); i++ ) {
      if (tag[i].freq >= minfreq) {
	sum += tag[i].freq;
	tag[k++] = tag[i];
      }
    }
    if (k < tag.size())
      tag.resize(k);
    
    // compute maximum likelihood estimates
    double f = 1.0 / sum;
    for( size_t i=0; i<tag.size(); i++ )
      tag[i].prob = (float)((double)tag[i].freq * f);
  }
  
  // smoothing required?
  else if (prior && observed < tag.size()) {
    // Witten Bell smoothing with the prior probabilities

    double f = 1.0 / (sum + observed);
    for( size_t i=0; i<tag.size(); i++ )
      tag[i].prob = (float)((tag[i].freq + observed * pp[i]) * f);
  }

  else {
    // no smoothing
    double f = 1.0 / sum;
    for( size_t i=0; i<tag.size(); i++ )
      tag[i].prob = (float)((double)tag[i].freq * f);
  }
  
  sort_tags();
}
