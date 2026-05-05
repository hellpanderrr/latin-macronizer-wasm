
/*******************************************************************/
/*                                                                 */
/*     File: Guesser.h                                             */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun 15 10:57:37 2007                              */
/* Modified: Fri Oct 19 10:52:55 2007 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "WordClass.h"
#include "SuffixLexicon.h"


/*****************  class Guesser  *********************************/

class Guesser {

private:
  vector<SuffixLexicon> sufflex;

public:
  WordClass wordclass;

  Guesser( FILE *file ) : wordclass( file, binary ) {
    fprintf(stderr, "[DEBUG] Guesser: wordclass done, pos=%ld\n", ftell(file));
    read_datavec( sufflex, file );
    fprintf(stderr, "[DEBUG] Guesser: sufflex done, pos=%ld\n", ftell(file));
  }

  void restore( FILE *file ) {
    wordclass.restore(file);
    read_datavec( sufflex, file );
  }

  void print( SymbolTable &symtab, FILE *file ) const {
    for( size_t i=0; i<sufflex.size(); i++ ) {
      fprintf(file,"wordclass %u\n", (unsigned)i);
      sufflex[i].print(symtab, file);
    }
  }

  Entry &lookup( const char *word ) {
    int n = wordclass.number(word);
    if (sufflex[n].is_empty())
      return sufflex[0].lookup(word);
    return sufflex[n].lookup(word);
  }
};
