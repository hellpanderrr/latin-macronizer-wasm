
/*******************************************************************/
/*                                                                 */
/*     File: WordClass.h                                           */
/*   Author: Helmut Schmid                                         */
/*                                                                 */
/*******************************************************************/

#ifndef _WORDCLASS_H
#define _WORDCLASS_H

#include <stdio.h>
#include <stdint.h>

#include "io.h"

typedef enum { text, binary } FileType;


/*******************************************************************/
/*                                                                 */
/*  compare                                                        */
/*                                                                 */
/*******************************************************************/

static int compare( const char *character, const char *string )

{
  const unsigned char *c = (const unsigned char*)character;
  const unsigned char *s = (const unsigned char*)string;
  for( size_t i=0; c[i]; i++ ) {
    if (c[i] < s[i])
      return -1;
    else if (c[i] > s[i])
      return 1;
  }
  return 0;
}


/*****************  class Transition  ******************************/

class Transition {
public:
  char *character;
  unsigned int target;

  Transition( char *c, unsigned t ) { 
    character = strdup(c); 
    target = t;
  };

  Transition( const Transition &i ) { 
    character = strdup(i.character); 
    target = i.target;
  };

  Transition( FILE *file ) {
    character = read_string(file);
    read_data(target, file);
  }

  ~Transition() { free(character); }

  void store( FILE *file ) const {
    write_string(character, file);
    write_data(target, file);
  }

  void restore( FILE *file ) {
    free(character);
    character = read_string(file);
    read_data(target, file);
  }
};


/*****************  class State  ***********************************/

class State {
public:
  int wordclass;
  vector<Transition> transition;

  State( int c=0 ) { wordclass = c; };

  State( FILE *file ) {
    read_data(wordclass, file);
    read_datavec(transition, file);
  }

  void store( FILE *file ) const {
    write_data(wordclass, file);
    write_datavec(transition, file);
  }

  void restore( FILE *file ) {
    read_data(wordclass, file);
    read_datavec(transition, file);
  }
};

/*****************  class WordClass  *******************************/

class WordClass {

private:
  vector<State> state;

  void read_text( FILE *file ) {
    char buffer[100];
    char *lastchar=NULL;
    int laststate=-1;

    number_of_classes = 1;
    for( size_t line=0; fgets(buffer,99,file); line++ ) {
      char *s = strtok(buffer,"\t");
      char *l = strtok(NULL,"\t");
      char *t = strtok(NULL,"\n");
      if (t == NULL)
	errx(1, "Error: in line %u of transducer file", (unsigned)line);
      char *e;
      long sn = strtol(s, &e, 10);
      if (*e != 0)
	errx(1, "Error: First element of line %u of transducer file is not a number", (unsigned)line);
      long tn = strtol(t, &e, 10);
      if (*e != 0)
	errx(1, "Error: Third element of line %u of transducer file is not a number", (unsigned)line);
    
      if (strcmp(l,"wordclass") == 0) {
	state[sn].wordclass = (int)tn;
	if ((int)number_of_classes <= tn)
	  number_of_classes = (unsigned int)tn+1;
	continue;
      }
      if (laststate > sn)
	errx(1, "Error: ordering of states violated in transducer file %d %ld",
	     laststate, sn);
      while (laststate < sn) {
	laststate++;
	state.push_back(State());
	lastchar = NULL;
      }
      if (lastchar && compare(lastchar, l) > 0)
	errx(1,"Error: character ordering violated in transducer file %s %s",
	     lastchar, l);
      state[sn].transition.push_back(Transition(l, (int)tn));
      lastchar = state[sn].transition.back().character;
    }
  }
  
  void read_binary( FILE *file ) {
    read_data(number_of_classes, file);
    read_datavec(state, file);
  }

public:
  uint64_t number_of_classes;

  WordClass( FILE *file, FileType t ) {
    if (t == binary)
      read_binary( file );
    else
      read_text( file );
  }

  void store( FILE *file ) const {
    write_data(number_of_classes, file);
    write_datavec(state, file);
  }

  void restore( FILE *file ) {
    read_data(number_of_classes, file);
    read_datavec(state, file);
  }

  int number( const char *string, int sn=0 ) {
    if (number_of_classes == 1)
      return 0; // default word class
    if (string[0] == 0)
      return state[sn].wordclass;
    
    vector<Transition> &t=state[sn].transition;
    size_t l=0;
    size_t r=t.size();
    while (l < r) {
      size_t m = (l + r) / 2;
      if (compare(t[m].character, string) < 0)
	l = m+1;
      else
	r = m;
    }
    
    if (l == t.size() || compare(t[l].character, string) != 0)
      return 0; // default word class
    
    return number( string+strlen(t[l].character), t[l].target );
  }

  void print( FILE *file ) {
    for( size_t i=0; i< state.size(); i++ ) {
      State &s = state[i];
      fprintf(file, "state %lu   ", (unsigned long)i);
      fprintf(file, "word class %u\n", s.wordclass);
      for( size_t k=0; k< s.transition.size(); k++ ) {
	Transition &t = s.transition[k];
	fprintf(file, "  %s -> %u\n", t.character, t.target);
      }
    }
  }
};

#endif
