
/*******************************************************************/
/*                                                                 */
/*     File: MakeSuffixLexicon.h                                   */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Sep 13 14:02:07 2007                              */
/* Modified: Wed Feb 11 17:28:01 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "Entry.h"

class MSLink;


/*****************  class STag  ************************************/

class STag {

public:
  SymNum number;  
  float  prob;
  double freq;
  double restfreq;
  double restprob;

  STag( SymNum n ) {
    number = n;
    freq = restfreq = 0.0;
    prob = 0.0;
  }

  void store( FILE *file ) const {
    write_data(number, file);
    write_data(prob, file);
  }

  inline int operator<(const STag tag) const { // for sorting
    return (number < tag.number);
  }
};


/*****************  class SEntry  **********************************/

class SEntry {

public:
  float freq;
  float restfreq;
  vector<STag> tag;

  SEntry() { freq = restfreq = 0.0; }

  void sort_tags() { sort(tag.begin(), tag.end()); }

  void store( FILE *file ) const {
    write_data( freq, file );
    write_datavec( tag, file );
  }

  void print( FILE *file, SymbolTable *symtab=NULL ) const {
    fprintf(file,"(%.2f %.2f): ", freq, restfreq);
    for( size_t i=0; i<tag.size(); i++ )
      if (symtab)
	fprintf(file," %s (%.3f %.3f)", symtab->name(tag[i].number), 
		tag[i].freq, tag[i].restfreq);
      else
	fprintf(file," %d (%.3f %.3f)", tag[i].number, 
		tag[i].freq, tag[i].restfreq);
    fprintf(file,"\n");
  }

  STag *find_tag( SymNum n ) {
    for( size_t i=0; i<tag.size(); i++ )
      if (tag[i].number == n)
	return &tag[i];
    return NULL;
  }

  STag &add_tag( SymNum n ) {
    STag *t = find_tag( n );
    if (t)
      return *t;
    tag.push_back(STag(n));
    return tag.back();
  }
};


/*****************  class MSNode  **********************************/

class MSNode {

 private:

  vector<MSLink> link;

  void subtract_frequencies( MSNode &daughter );

  void estimate_probs( double mlp, vector<double> &prob );

 public:
  SEntry entry;
  MSNode() {};

  void add( vector<bool> &is_oc_tag, const Entry &entry, const char *first, const char *last );
  void prepare();

  void prune( double threshold, char *suffix /*???*/);

  void estimate_probs( double mlp );

  void store( FILE *file ) const;

};


/*****************  class MSLink  **********************************/

class MSLink {

public:
  MSNode node;
  bool active;
  char symbol;

  MSLink( char s ) { active = false; symbol = s; }

  void store( FILE *file ) const {
    node.store( file );
    fputc( symbol, file );
  }

};


/*****************  class MakeSuffixLexicon  ***********************/

class MakeSuffixLexicon {

  MSNode root;

public:
  MakeSuffixLexicon() {};

  void add(vector<bool> &is_oc_tag, const Entry &e, const char *word, int msl) {
    // check whether this word occurred with an open class tag
    size_t i;
    for( i=0; i<e.tag.size(); i++ )
      if (is_oc_tag[e.tag[i].number] && e.tag[i].freq > 0)
	break;
    if (i == e.tag.size())
      return;

    int l=(int)strlen(word);
    if (msl > l)
      msl = l;
    root.add( is_oc_tag, e, word+l-msl, word+l-1 );
  }

  void prune( double threshold, double minlexprob ) { 
    char buffer[1001];
    buffer[1000] = 0;
    root.prepare();
    root.prune( threshold, buffer+1000 );
    root.estimate_probs( minlexprob );
  }

  size_t number_of_tags() { return root.entry.tag.size(); };

  void store( FILE *file ) const { root.store(file); }
};

