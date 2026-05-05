
/*******************************************************************/
/*                                                                 */
/*     File: Lexicon.h                                             */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jun 14 16:23:17 2007                              */
/* Modified: Wed Jun 24 10:38:55 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef LEXICON_H
#define LEXICON_H

#include "SymbolTable.h"
#include "Entry.h"
#include "Corpus.h"


/*****************  class Lexicon  *********************************/

class Lexicon {

private:
  SymbolTable wordtab;
  vector<Entry> entry;
  vector<double> PriorProb;

  Entry &add_word( const char *word ) {
    size_t n = wordtab.number( word );
    if (n == entry.size()) // new word?
      entry.resize(n+1); // add a new entry
    return entry[n];
  }

  void add_word_and_tag( const char *word, SymNum tagnum ) {
    add_word(word).add_tag( tagnum );
  }

  void increment_tag_count( const char *word, SymNum tagnum ) {
    lookup( word )->find_tag( tagnum )->freq++;
  }

  void compute_priors( Corpus &corpus );

public:
  Lexicon( Corpus &corpus, Sentence *wordlist=NULL );

  Lexicon( FILE *file ) : wordtab(file) {
    fprintf(stderr, "[DEBUG] Lexicon: wordtab done, pos=%ld\n", ftell(file));
    read_datavec( entry, file );
    fprintf(stderr, "[DEBUG] Lexicon: entry vector done, pos=%ld\n", ftell(file));
    read_basedatavec( PriorProb, file );
    fprintf(stderr, "[DEBUG] Lexicon: PriorProb done, pos=%ld\n", ftell(file));
  }

  void store( FILE *file ) const {
    // Store the hash table with the words
    wordtab.store(file);
    write_datavec( entry, file );
    write_basedatavec( PriorProb, file );
  }
  
  void print( SymbolTable &symtab, FILE *file ) const {
    fprintf(file,"Prior Probabilities of the POS tags\n");
    fprintf(file,"-------------------------------------------------------\n");
    for( SymNum i=0; i<PriorProb.size(); i++ )
      fprintf(file,"%s\t%lg\n", symtab.name(i), PriorProb[i]);
    
    fprintf(file,"\nLexicon with word frequencies and POS tag probabilities\n");
    fprintf(file,"-------------------------------------------------------\n");
    for( SymNum n=0; n<wordtab.size(); n++ ) {
      fprintf(file,"%s ", wordtab.name(n));
      entry[n].print(symtab,file);
    }
  }
  
  Entry *lookup( const char *word ) {
    SymbolTable::iterator it = wordtab.find(word);
    if (it == wordtab.end())
      return NULL;
    return &entry[it->second];
  }

  double prior_prob( SymNum tag ) { return PriorProb[tag]; }

  Entry &get_entry( size_t n  ) { return entry[n]; }

  typedef SymbolTable::iterator iterator;

  iterator find( const char *s ) { return wordtab.find(s); }
  iterator begin() { return wordtab.begin(); }
  iterator end()   { return wordtab.end(); }
  size_t   size()  { return wordtab.size(); }
};

#endif
