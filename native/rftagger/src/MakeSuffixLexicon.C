/*******************************************************************/
/*                                                                 */
/*     File: MakeSuffixLexicon.C                                   */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Sep 13 14:19:57 2007                              */
/* Modified: Mon Jan 12 13:37:49 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <assert.h>
#include <math.h>

#include "MakeSuffixLexicon.h"

static const int MinSuffFreq = 5;

static const double MinWBFreq = 0.5;


/*******************************************************************/
/*                                                                 */
/*  compute_restprobs                                              */
/*                                                                 */
/*******************************************************************/

void compute_restprobs( SEntry &entry )

{
  double sum = 0.0;
  for( size_t k=0; k<entry.tag.size(); k++ )
    sum += entry.tag[k].restfreq;
  for( size_t k=0; k<entry.tag.size(); k++ )
    entry.tag[k].restprob = entry.tag[k].restfreq / sum;
  entry.restfreq = (float)sum;
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::prepare                                                */
/*                                                                 */
/*******************************************************************/

void MSNode::prepare()

{
  entry.sort_tags();

  for( size_t i=0; i<entry.tag.size(); i++ )
    entry.tag[i].restfreq = entry.tag[i].freq;

  compute_restprobs( entry );
  entry.freq = entry.restfreq;

  for( size_t i=0; i<link.size(); i++ )
    link[i].node.prepare();
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::store                                                  */
/*                                                                 */
/*******************************************************************/

void MSNode::store( FILE *file ) const

{
  entry.store( file );
  size_t n=0;
  for( size_t i=0; i<link.size(); i++ )
    if (link[i].active)
      n++;
  write_data( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  for( size_t i=0; i<link.size(); i++ )
    if (link[i].active)
      link[i].store( file );
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::add                                                    */
/*                                                                 */
/*******************************************************************/

void MSNode::add( vector<bool> &is_oc_tag, const Entry &e, 
		  const char *first, const char *last )
{
  // sum up the tag probabilities of all words with the current suffix
  for( size_t i=0; i<e.tag.size(); i++ ) {
    const Tag &t = e.tag[i];
    if (is_oc_tag[t.number] && t.freq > 0)
      entry.add_tag(t.number).freq += t.prob;
  }
  
  // extend the suffix tree
  if (first <= last) {
    size_t i;
    for( i=0; i<link.size(); i++ )
      if (link[i].symbol == *last)
	break;
    if (i == link.size())
      link.push_back(MSLink(*last));
    link[i].node.add( is_oc_tag, e, first, last-1 );
  }
}


/*******************************************************************/
/*                                                                 */
/*  compute_info_gain                                              */
/*                                                                 */
/*******************************************************************/

static double compute_info_gain( SEntry &entry, SEntry &parent_entry )

{
  double gain=0.0;
  int tag_count = 0;
  size_t k=0;
  STag *pt = &parent_entry.tag[k];
  for( size_t i=0; i<entry.tag.size(); i++ ) {
    STag &t = entry.tag[i];
    if (t.restfreq > 0.0) {
      while (t.number != pt->number)
	pt = &parent_entry.tag[++k];
      assert(t.number == pt->number);
      gain += t.restfreq * log(t.restprob / pt->restprob);
      if (t.restfreq > MinWBFreq)
	tag_count++;
    }
  }

  assert(gain > -0.00001);
  //fprintf(stderr,"> %g %g/%d=\t", entry.restfreq, gain, tag_count);
  if (tag_count == 0)
    return 0.0;
  else
    return gain / tag_count;
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::subtract_frequencies                                   */
/*                                                                 */
/*******************************************************************/

void MSNode::subtract_frequencies( MSNode &daughter )

{
  vector<STag> &mt=entry.tag;
  vector<STag> &dt=daughter.entry.tag;

  size_t k=0;
  for( size_t i=0; i<dt.size(); i++ ) {
    while (mt[k].number < dt[i].number) 
      k++;
    assert(mt[k].number == dt[i].number);
    mt[k].restfreq -= dt[i].restfreq;
    // allow rounding errors
    if (mt[k].restfreq < 0.00001)
      mt[k].restfreq = 0.0;
    assert(mt[k].restfreq >= 0.0);
  }

  compute_restprobs( entry );
}


/*******************************************************************/
/*                                                                 */
/*  complement_entry                                               */
/*                                                                 */
/*******************************************************************/

void complement_entry( SEntry &result, SEntry &entry, SEntry &parent_entry )

{
  size_t k=0;
  STag *t = &entry.tag[k];
  for( size_t i=0; i<parent_entry.tag.size(); i++ ) {
    STag &pt = parent_entry.tag[i];
    double f = pt.restfreq;
    if (t->number == pt.number) {
      f -= t->restfreq;
      if (++k < entry.tag.size())
	t = &entry.tag[k];
    }
    if (f > 0.01) {
      STag &rt = result.add_tag(pt.number);
      rt.restfreq = rt.freq = f;
    }
  }

  compute_restprobs( result );
  assert(result.restfreq > 0.0);
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::prune                                                  */
/*                                                                 */
/*******************************************************************/

void MSNode::prune( double threshold, char *suffix )

{
  // allocate an array for the probability values
  //fprintf(stderr,">>> pruning %s\n", suffix);
  //entry.print(stderr, NULL);

  // determine the set of informative links
  for(;;) {
    // compute the next best link
    double max_gain = 0.0;
    size_t best_link = 0;
    for( size_t i=0; i<link.size(); i++ ) {
      SEntry &e = link[i].node.entry;
      if (!link[i].active) {
	if (e.restfreq >= MinSuffFreq) {
	  double gain = compute_info_gain( e, entry );
	  //fprintf(stderr,"%c gain = %g\n", link[i].symbol, gain);
	  if (max_gain < gain) {
	    max_gain = gain;
	    best_link = i;
	  }
	}
	
	if (e.restfreq > entry.restfreq * 0.5 && 
	    e.restfreq < entry.restfreq * 0.99)
	  {
	    SEntry ce;
	    complement_entry( ce, e, entry );
	    if (ce.restfreq >= MinSuffFreq) {
	      double gain = compute_info_gain( ce, entry );
	      //fprintf(stderr,"not %c gain = %g\n", link[i].symbol, gain);
	      if (max_gain < gain) {
		max_gain = gain;
		best_link = i;
	      }
	    }
	  }
      }
    }

    if (max_gain <= 0.0)
      break;
    double df = link[best_link].node.entry.restfreq;
    double mf = entry.restfreq;
    // Is the difference significant or
    // does the best daughter account for more than 90% of the frequencies?
    if (max_gain >= threshold || (df > MinSuffFreq * 2 && df > mf * 0.9)) {
      //fprintf(stderr,"best suffix = \"%c%s\"  gain = %g\n", 
      //      link[best_link].symbol, suffix, max_gain );
      link[best_link].active = true;
      subtract_frequencies( link[best_link].node );
    }
    else
      break;
  }

  for( size_t i=0; i<link.size(); i++ )
    if (link[i].active) {
      *(suffix-1) = link[i].symbol;
      link[i].node.prune( threshold, suffix-1 );
    }

  //fprintf(stderr,"<<< pruning\n");
}


/*******************************************************************/
/*                                                                 */
/*  compute_backoff_probs                                          */
/*                                                                 */
/*******************************************************************/

static void compute_backoff_probs( SEntry &entry, vector<double> &p, 
				   vector<double> &prob )
{
  // compute the "number of observed tags"
  size_t observed_count = 0;
  for( size_t i=0; i<entry.tag.size(); i++ )
    if (entry.tag[i].freq > MinWBFreq)
      observed_count++;

  // Add frequencies and weighted back-off probabilities
  p.clear();
  p.resize(prob.size(), 0.0);
  for( size_t t=0; t<prob.size(); t++ )
    p[t] = (double)observed_count * prob[t];
  for( size_t i=0; i<entry.tag.size(); i++ )
    p[entry.tag[i].number] += entry.tag[i].freq;
  double f = 1.0 / ((double)observed_count + entry.freq);
  double sum=0.0;
  for( size_t t=0; t<p.size(); t++ ) {
    p[t] *= f;
    sum += p[t];
  }
  assert(sum > 0.99999 && sum < 1.00001);
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::estimate_probs                                         */
/*                                                                 */
/*******************************************************************/

void MSNode::estimate_probs( double mlp, vector<double> &prob )

{
  vector<double> bo_prob;
  compute_backoff_probs( entry, bo_prob, prob );

  vector<double> freq(bo_prob.size(), 0.0);

  // copy the frequencies and compute the number of observed tags
  // and the maximal tag frequency
  size_t observed_count = 0;
  float max_freq = 0;
  for( size_t i=0; i<entry.tag.size(); i++ ) {
    STag &t = entry.tag[i];
    freq[t.number] = t.restfreq;
    if (t.restfreq > MinWBFreq)
      observed_count++;
    if (max_freq < t.restfreq)
      max_freq = (float)t.restfreq;
  }

  // Witten-Bell smoothing; Add the back-off probabilities 
  // multiplied by the number of observed events
  // Eliminate low-probability tags
  if (observed_count == 0)
    observed_count = 1;
  double sum = 0.0;
  for( size_t t=0; t<bo_prob.size(); t++ ) {
    freq[t] += (double)observed_count * bo_prob[t];
    if (freq[t] < max_freq * mlp)
      freq[t] = 0.0;
    else
      sum += freq[t];
  }
  
  // compute the new set of possible tags and their probabilities
  entry.tag.clear();
  for( SymNum t=0; t<(SymNum)freq.size(); t++ )
    if (freq[t] > 0.0) {
      entry.tag.push_back(STag(t));
      entry.tag.back().prob = (float)((double)freq[t] / sum);
    }
  
  for( size_t i=0; i<link.size(); i++ )
    if (link[i].active)
      link[i].node.estimate_probs( mlp, bo_prob );

  entry.freq = 0.0;
}


/*******************************************************************/
/*                                                                 */
/*  MSNode::estimate_probs                                         */
/*                                                                 */
/*******************************************************************/

void MSNode::estimate_probs( double mlp )

{
  size_t N=0;
  for( size_t i=0; i<entry.tag.size(); i++ )
    if (N < entry.tag[i].number)
      N = entry.tag[i].number;

  vector<double> prob(N+1 , 0.0);
  double p = 1.0 / (double)entry.tag.size();
  double sum = 0.0;
  for( size_t i=0; i<entry.tag.size(); i++ ) {
    prob[entry.tag[i].number] = p;
    sum += prob[entry.tag[i].number];
  }

  assert(sum > 0.99999 && p < 1.00001);
  estimate_probs( mlp, prob );
}
