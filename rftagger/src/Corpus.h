
/*******************************************************************/
/*                                                                 */
/*     File: Corpus.h                                              */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed May 23 14:30:47 2007                              */
/* Modified: Thu Sep 26 10:36:11 2013 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef _CORPUS_H
#define _CORPUS_H

#include <string.h>

#include "io.h"
#include "SymbolTable.h"


/*****************  class Token  ***********************************/

class Token {

 public:
  char *word;
  SymNum tag;

  Token() { word = NULL; }

  Token( char *w ) {
    word = strdup(w);
    tag = 0;
  }

  Token( char *w, SymNum n ) {
    word = strdup(w);
    tag = n;
  }

  Token( const Token &token ) {
    word = strdup(token.word);
    tag = token.tag;
  }

  ~Token() {
    free(word);
  }
};


/*****************  class Sentence  ********************************/

class Sentence {

 public:
  vector<Token> token;

  Sentence( SymbolTable &tagmap, FILE *file ) {
    char buffer[10000];
    while (fgets(buffer,10000,file)) {
      // empty line ?
      if (buffer[0] == '\n') {
	if (token.size() > 0)
	  break;
	else
	  continue;  // ignore empty lines at sentence start
      }

      // split the line into a word and a POS tag
      char *wordstring = strtok( buffer, "\t" );
      char *tagstring = strtok( NULL, " \t\n" );
      if (tagstring == NULL)
	errx(1, "Error: missing tag at %s\n", wordstring);
      token.push_back(Token(wordstring, tagmap.number(tagstring)));
    }
  }

  Sentence( FILE *file ) {
    char buffer[10000];
    while (fgets(buffer,10000,file)) {
      char *p;
      for( p=buffer; *p == ' ' || *p == '\t'; p++ ) ;
      // empty line ?
      if (*p == '\n') {
	if (token.size() > 0)
	  break;
	else
	  continue;  // ignore empty lines at sentence start
      }

      char *wordstring = strtok( p, "\t\n" );
      if (wordstring == NULL)
	errx(1, "Error: in corpus");
      token.push_back(Token(wordstring));
    }
  }

  Sentence( char** words, int size ) {
    for (int i = 0; i < size; i++) {
      token.push_back(Token(words[i]));
    }
  }


  void print( SymbolTable &tagmap, FILE *file=stdout ) {
    for( size_t i=0; i<token.size(); i++ )
      fprintf(file, "%s\t%s\n", token[i].word, tagmap.name(token[i].tag));
    fputc('\n', file);
    fflush(file);
  }
};


/*****************  class Corpus  **********************************/

class Corpus {

 public:
  SymbolTable &tagmap;
  vector<Sentence> sentence;

  size_t number_of_tags() { return tagmap.size(); };

  Corpus( SymbolTable &tm, FILE *file )
    : tagmap(tm)
    {
      do {
	sentence.push_back(Sentence( tagmap, file ));
      } while (sentence.back().token.size() > 0);
      sentence.pop_back();
    }

  SymNum boundary_tag() { return 0; }
};

#endif
