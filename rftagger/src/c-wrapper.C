
/*******************************************************************/
/*                                                                 */
/*     File: c-wrapper.C                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Mon Nov 14 15:54:44 2011                              */
/* Modified: Mon Nov 14 15:56:09 2011 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "POSTagger.h"


extern "C" POSTagger* initTagger(const char* fileName, bool Normalize, 
				 double BeamThreshold, bool SentStartHeuristic,
				 int MaxBeamSize)
{
  FILE *file = open_file(fileName, "rb");
  POSTagger* tagger = new POSTagger(file, Normalize, BeamThreshold, 
				    SentStartHeuristic, MaxBeamSize);
  fclose(file);
  return tagger;
}


extern "C" void getTags(POSTagger* tagger, char** words, int sentLen, 
			char** tags)
{
  Sentence sent(words, sentLen);
  tagger->annotate(sent);
  
  for( size_t i=0; i<sent.token.size(); i++ )
    tags[i] = strdup(tagger->tagmap.name(sent.token[i].tag));
}


extern "C" void destroyTagger(POSTagger* tagger) {
  delete tagger;
}
