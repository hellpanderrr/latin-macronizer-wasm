
/*******************************************************************/
/*                                                                 */
/*     File: LexSmoother.h                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose: smoothing of lexical probabilities                    */
/*  Created: Wed Jul 25 17:24:15 2007                              */
/* Modified: Thu Nov 15 09:32:36 2007 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include <vector>
using std::vector;

// This code computes average tag probabilities for each class of
// words with the same set of possible tags.
// The Witten-Bell method is used to smooth the lexical probabilities
// with these word-class-based probabilities.
// The SmoothingWeight is used to increase or decrease the weight of
// the word-class-based probabilities. The default value of 1.0 is 
// usually pretty good.


class Lexicon;

/*****************  class LexSmoother  *****************************/

class LexSmoother {

  double SmoothingWeight;

  vector<Entry> classentry;
  size_t find_entry( Entry &entry );
  void add_entry( Entry &entry );
  void smooth_entry( Entry &entry );

public:
  LexSmoother( Lexicon &lexicon, double SmoothingWeight );

};

