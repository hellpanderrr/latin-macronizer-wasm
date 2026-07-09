
/*******************************************************************/
/*                                                                 */
/*     File: MakeGuesser.C                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun 15 10:57:27 2007                              */
/* Modified: Wed Jan 16 14:19:48 2008 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <stdio.h>

#include "MakeGuesser.h"


/*******************************************************************/
/*                                                                 */
/*  MakeGuesser::build_suffix_trees                                */
/*                                                                 */
/*******************************************************************/

void MakeGuesser::build_suffix_trees(Lexicon &lexicon, vector<bool> &is_oc_tag, 
				     double threshold, int msl, double mlp)
{
  sufflex.resize( wordclass.number_of_classes );

  // collect frequency information from the lexicon
  for( Lexicon::iterator it=lexicon.begin(); it!=lexicon.end(); it++ ) {
    const char *word = it->first;
    int wc = wordclass.number( word );
    Entry &entry = lexicon.get_entry(it->second);
    if (entry.freq > 0)
      sufflex[wc].add( is_oc_tag, entry, word, msl );
  }

  // estimate the tag probabilities
  for( size_t i=0; i<sufflex.size(); i++ ) {
    if (sufflex[i].number_of_tags() == 0)
      fprintf(stderr,"Warning: Word class %d did not occur!\n", (int)i);
    else
      sufflex[i].prune( threshold, mlp );
  }
}


/*******************************************************************/
/*                                                                 */
/*  MakeGuesser::MakeGuesser                                       */
/*                                                                 */
/*******************************************************************/

MakeGuesser::MakeGuesser( FILE *wcfile, FILE *ocfile, SymbolTable &tagmap,
		       Lexicon &lexicon, double threshold, int msl, double mlp)
  : wordclass( wcfile, text )
{
  vector<bool> is_oc_tag;
  char buffer[10000];
  
  // read the set of open class POS tags from a file
  if (ocfile) {
    is_oc_tag.resize( tagmap.size(), false );
    while (fscanf(ocfile, "%s", buffer) == 1) {
      SymNum tagnum;
      if (tagmap.lookup( buffer, tagnum ))
	is_oc_tag[tagnum] = 1;
      else
	warnx("Warning: open class file contains the unknown POS tag \"%s\"", buffer);
    }
  }
  else
    is_oc_tag.resize( tagmap.size(), true );

  build_suffix_trees( lexicon, is_oc_tag, threshold, msl, mlp );
}
