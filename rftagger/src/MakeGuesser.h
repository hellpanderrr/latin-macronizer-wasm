
/*******************************************************************/
/*                                                                 */
/*     File: MakeGuesser.h                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun 15 10:57:37 2007                              */
/* Modified: Wed Feb 11 17:01:57 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "Lexicon.h"
#include "WordClass.h"
#include "MakeSuffixLexicon.h"


/*****************  class MakeGuesser  *****************************/

class MakeGuesser {

private:
  vector<MakeSuffixLexicon> sufflex;

  void build_suffix_trees( Lexicon&, vector<bool> &is_oc_tag, 
			   double threshold, int msl, double mlp );

public:
  WordClass wordclass;
  MakeGuesser( FILE *wcfile, FILE *ocfile, SymbolTable&, Lexicon&, 
	       double threshold, int max_suffix_length=7, double mlp=0.01 );

  void store( FILE *file ) const {
    wordclass.store( file );
    write_datavec( sufflex, file );
  }
};
