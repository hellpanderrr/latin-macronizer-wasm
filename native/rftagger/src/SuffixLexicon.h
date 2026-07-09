
/*******************************************************************/
/*                                                                 */
/*     File: SuffixLexicon.h                                       */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Sep 13 14:02:07 2007                              */
/* Modified: Wed Feb 11 17:38:24 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include <vector>
using std::vector;

#include "Entry.h"

class SLink;


/*****************  class SNode  ***********************************/

class SNode {

 private:

  Entry entry;
  vector<SLink> link;

 public:
  SNode() {};

 SNode( FILE *file ) : entry( file ) {
    read_datavec( link, file );
  };

  Entry &lookup( const char *word, int pos );

  void print( SymbolTable *symtab, FILE *file, char *buffer, int pos ) const;

  bool is_empty() { return (link.size() + entry.tag.size() == 0); }
};


/*****************  class SLink  ***********************************/

class SLink {

public:
  SNode node;
  char symbol;

  SLink() : symbol(0) {}

  SLink( FILE *file ) : node( file ) {
    symbol = (char)fgetc( file );
  }

  void restore( FILE *file ) {
    node = SNode( file );
    symbol = (char)fgetc( file );
  }
};


/*****************  class SuffixLexicon  ***************************/

class SuffixLexicon {

  SNode root;

public:
  SuffixLexicon() {};

 SuffixLexicon( FILE *file ): root( file ) {
    fprintf(stderr, "[DEBUG] SuffixLexicon: starting, pos=%ld\n", ftell(file));
    fprintf(stderr, "[DEBUG] SuffixLexicon: loaded, final pos=%ld\n", ftell(file));
  }

  void restore( FILE *file ) {
    root = SNode( file );
  }

  void print( SymbolTable &symtab, FILE *file ) const { 
    char buffer[1000];
    root.print( &symtab, file, buffer, 0);
  }

  Entry &lookup( const char *word ) {
    return root.lookup(word, (int)strlen(word)-1);
  }

  bool is_empty() { return root.is_empty(); }
};

