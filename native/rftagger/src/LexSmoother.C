
/*******************************************************************/
/*                                                                 */
/*     File: LexSmoother.C                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul 25 17:24:58 2007                              */
/* Modified: Mon Jan 12 13:29:41 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <assert.h>

#include "Lexicon.h"
#include "LexSmoother.h"

// The tag probabilities of words are smoothed with Witten-Bell
// smoothing and a backoff probability distribution which is the
// average tag probability distribution of the words with the same 
// set of possible tags.


/*******************************************************************/
/*                                                                 */
/*  entry_cmp                                                      */
/*                                                                 */
/*******************************************************************/

int entry_cmp( const Entry &e1, const Entry &e2 )

{
  // compare the sets od possible tags of two words
  int d = (int)e1.tag.size() - (int)e2.tag.size();
  if (d)
    return d;
  for( size_t i=0; i<e1.tag.size(); i++ ) {
    int d = (int)e1.tag[i].number - (int)e2.tag[i].number;
    if (d)
      return d;
  }
  return 0;
}


/*******************************************************************/
/*                                                                 */
/*  LexSmoother::find_entry                                        */
/*                                                                 */
/*******************************************************************/

size_t LexSmoother::find_entry( Entry &entry )

{
  // find the respective set of possible tags in the classentry table
  size_t l = 0;
  size_t r = classentry.size();
  while (l < r) {
    size_t m = (l + r) >> 1;
    if (entry_cmp( classentry[m], entry ) < 0)
      l = m+1;
    else 
      r = m;
  }
  return l;
}


/*******************************************************************/
/*                                                                 */
/*  LexSmoother::add_entry                                         */
/*                                                                 */
/*******************************************************************/

void LexSmoother::add_entry( Entry &entry )

{
  // add the set of possible tags to the classentry table and
  // add the probabilities to the sum of probabilities stored in classentry 

  // find the entry with binary search
  size_t n = find_entry( entry );

  // new entry?
  if (n == classentry.size() || entry_cmp( classentry[n], entry ) != 0) {
    // create space for the new element
    classentry.resize(classentry.size() + 1);
    for( size_t i=classentry.size()-1; i>n; i-- )
      classentry[i].tag.swap(classentry[i-1].tag);

    // create a new element
    classentry[n].tag.reserve(entry.tag.size());
    for( size_t i=0; i<entry.tag.size(); i++ )
      classentry[n].tag.push_back(Tag(entry.tag[i].number));
  }

  // Sum up the probs
  for( size_t i=0; i<entry.tag.size(); i++ )
    classentry[n].tag[i].prob += entry.tag[i].prob;
}


/*******************************************************************/
/*                                                                 */
/*  LexSmoother::smooth_entry                                      */
/*                                                                 */
/*******************************************************************/

void LexSmoother::smooth_entry( Entry &entry )

{
  // look up the class entry
  size_t n = find_entry( entry );
  vector<Tag> &ctag = classentry[n].tag;
  assert(n < classentry.size() && entry_cmp( entry, classentry[n] ) == 0);

  // Witten-Bell smoothing
  // compute the number of observed tags
  size_t observed_tags=0;
  for( size_t i=0; i<entry.tag.size(); i++ )
    if (entry.tag[i].freq > 0)
      observed_tags++;
  if (observed_tags == 0)
    observed_tags = 1;

  // smooth the frequencies by adding the weighted class-based probabilities
  double sum = 0.0;
  for( size_t i=0; i<entry.tag.size(); i++ ) {
    double x = (double)observed_tags * SmoothingWeight * ctag[i].prob;
    entry.tag[i].prob = (float)((double)entry.tag[i].freq + x);
    sum += entry.tag[i].prob;
  }
  
  // normalize the frequencies to obtain probabilities
  for( size_t i=0; i<entry.tag.size(); i++ )
    entry.tag[i].prob = (float)(entry.tag[i].prob / sum);
}


/*******************************************************************/
/*                                                                 */
/*  LexSmoother::LexSmoother                                       */
/*                                                                 */
/*******************************************************************/

LexSmoother::LexSmoother( Lexicon &lexicon, double sw )
  : SmoothingWeight(sw)
{
  // Sum up the tag probabilities for each class
  for( size_t i=0; i<lexicon.size(); i++ )
    add_entry( lexicon.get_entry(i) );

  // estimate the class-based tag probabilities
  for( size_t i=0; i<classentry.size(); i++ ) {
    Entry &entry = classentry[i];

    double sum=0.0;
    for( size_t k=0; k<entry.tag.size(); k++ )
      sum += entry.tag[k].prob;

    for( size_t k=0; k<entry.tag.size(); k++ )
      entry.tag[k].prob = (float)(entry.tag[k].prob / sum);
  }
  
  // Smooth the lexicon entries
  for( size_t i=0; i<lexicon.size(); i++ )
    smooth_entry( lexicon.get_entry(i) );
}
