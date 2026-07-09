
/*******************************************************************/
/*                                                                 */
/*     File: Entry.h                                               */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jun 14 16:23:17 2007                              */
/* Modified: Thu Jan 29 12:23:06 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef _ENTRY_H
#define _ENTRY_H

#include "SymbolTable.h"
#include "io.h"

/*****************  class Tag  *************************************/

class Tag {

public:
  SymNum number;  
  unsigned int freq;
  float prob;

  Tag() {}  // resize wants this

  Tag( SymNum n ) {
    number = n;
    freq = 0;
    prob = 0.0;
  }

  Tag( SymNum n, float p ) {
    number = n;
    freq = 0;
    prob = p;
  }

  Tag ( FILE *file ) {
    read_data(number, file);
    read_data(prob, file);
    freq = 0;
  }

  void store( FILE *file ) const {
    write_data(number, file);
    write_data(prob, file);
  }

  void restore( FILE *file ) {
    read_data(number, file);
    read_data(prob, file);
    freq = 0;
  }

  inline int operator<(const Tag tag) const { // for sorting
    return (number < tag.number);
  }
};


/*****************  class Entry  ***********************************/

class Entry {

public:
  float freq;
  vector<Tag> tag;

  Entry() { freq = 0.0; }

  Entry( FILE *file ) {
    read_data( freq, file );
    read_datavec( tag, file );
  }

  void sort_tags() { sort(tag.begin(), tag.end()); }

  void store( FILE *file ) const {
    write_data( freq, file );
    write_datavec( tag, file );
  }

  void restore( FILE *file ) {
    read_data( freq, file );
    read_datavec( tag, file );
  }

  void print( FILE *file ) const {
    fprintf(file,"(%.2f): ", freq);
    for( size_t i=0; i<tag.size(); i++ )
      fprintf(file," %d (%.3f)", tag[i].number, tag[i].prob);
    fprintf(file,"\n");
  }

  void print( SymbolTable &symtab, FILE *file ) const {
    fprintf(file,"(%.2f): ", freq);
    for( size_t i=0; i<tag.size(); i++ )
      fprintf(file," %s (%.3f)", symtab.name(tag[i].number), tag[i].prob);
    fprintf(file,"\n");
  }

  Tag *find_tag( SymNum n ) {
    for( size_t i=0; i<tag.size(); i++ )
      if (tag[i].number == n)
	return &tag[i];
    return NULL;
  }

  Tag &add_tag( SymNum n ) {
    Tag *t = find_tag( n );
    if (t)
      return *t;
    tag.push_back(Tag(n));
    return tag.back();
  }

  void estimate_tag_probs( double MinProb=0.0, vector<double> *PriorProb=NULL );

  size_t max_tag_index() {
    size_t N = 0;
    for( size_t i=0; i<tag.size(); i++ )
      if (N < tag[i].number)
	N = tag[i].number;
    return N;
  }
};

#endif
