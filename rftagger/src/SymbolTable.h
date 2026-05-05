
/*MA****************************************************************/
/*                                                                 */
/*     File: SymbolTable.h                                         */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jan  2 14:55:10 2003                              */
/* Modified: Tue Jul 28 16:38:45 2015 (schmid)                     */
/*                                                                 */
/*ME****************************************************************/

#ifndef _SYMBOL_TABLE
#define _SYMBOL_TABLE

#include <stdio.h>
#include <stdlib.h>
#include <limits.h>
#include <string.h>

#include <vector>
using std::vector;

#include "sgi.h"
#include "io.h"

typedef unsigned int SymNum;
const size_t MaxSymNum = UINT_MAX;


/*****************  class SymbolTable  *****************************/

class SymbolTable {

private:

  struct eqstr {
    bool operator()(const char* s1, const char* s2) const {
      return strcmp(s1, s2) == 0;
    }
  };

  typedef hash_map<const char*, SymNum, hash<const char*>, eqstr> SymbolMap;

  SymbolMap ST;
  vector<char*> SN;

public:
  ~SymbolTable() {
    for( size_t i=0; i<SN.size(); i++ )
      free(SN[i]);
  }

  SymbolTable() {}

  SymbolTable( FILE *file ) {
    uint64_t n;
    read_size( n, file );
    fprintf(stderr, "[DEBUG] SymbolTable: reading %llu strings\n", (unsigned long long)n);
    char buffer[10000];
    for( uint64_t i=0; i<n; i++ ) {
      for( char *p=buffer; (*p = (char)fgetc(file)); p++ ) ;
      if (i < 3 || i >= n-3) {
        fprintf(stderr, "[DEBUG] SymbolTable[%llu]: '%s' (pos=%ld)\n", (unsigned long long)i, buffer, ftell(file));
      }
      number(buffer);
    }
    fprintf(stderr, "[DEBUG] SymbolTable: done, final pos=%ld\n", ftell(file));
  }

  SymbolTable( SymbolTable &tab, const char *s, size_t n) {
    // Copy the symbols from tab to this table
    for( SymNum i=0; i<tab.size(); i++ )
      number(tab.name(i));

    // Add n additional symbols which consist of the string s 
    // followed by a number in the range between 0 and n-1
    for( size_t i=0; i<n; i++ ) { // create the additional n symbols
      char buffer[1000];
      sprintf(buffer,"%s%d", s, (int)i);
      number(buffer);
    }
  }

  void store( FILE *file ) const {
    uint64_t n=SN.size();
    fwrite( &n, sizeof(uint64_t), 1, file );
    for( size_t i=0; i<n; i++ ) {
      char *p = SN[i]; 
      do { fputc( *p, file ); } while (*(p++));
    }
  }

  void print( FILE *file ) const {
    for( size_t i=0; i<SN.size(); i++ )
      fprintf(file,"%s -> %u\n", SN[i], (unsigned)i);
  }

  SymNum number( const char *s ) {
    SymbolMap::iterator it=ST.find(s);
    if (it != ST.end())
      return it->second;

    // insert the new symbol into the tables
    char *r = strdup(s);
    size_t n = SN.size();
    if (n > MaxSymNum)
      throw("too many grammar symbols!");
    SN.push_back(r);
    ST[r] = (SymNum)n;
    return (SymNum)n;
  }

  bool lookup( const char *s, SymNum &result ) {
    SymbolMap::iterator it=ST.find(s);
    bool found = (it != ST.end());
    // Debug: log lookup for specific words
    if (s && (strcmp(s, "omnis")==0 || strcmp(s, "aliam")==0 || strcmp(s, "lingua")==0 || strcmp(s, "nostra")==0)) {
        fprintf(stderr, "[DEBUG] SymbolTable::lookup: word='%s', %s, ptr=%p\n", s, found ? "FOUND" : "NOT FOUND", (void*)s);
        if (found) {
            fprintf(stderr, "[DEBUG]   -> symbol id=%u\n", (unsigned)it->second);
        }
    }
    if (it == ST.end())
      return false;
    result = it->second;
    return true;
  }

  const char *name( SymNum n ) const {
    if (n < SN.size())
      return SN[n];
    return NULL;
  }

  typedef SymbolMap::iterator iterator;

  iterator find( const char *s ) {
      SymbolMap::iterator it = ST.find(s);
      bool found = (it != ST.end());
      if (s && (strcmp(s, "omnis")==0 || strcmp(s, "aliam")==0 || strcmp(s, "lingua")==0 || strcmp(s, "nostra")==0)) {
          fprintf(stderr, "[DEBUG] SymbolTable::find: word='%s', %s, ptr=%p\n", s, found ? "FOUND" : "NOT FOUND", (void*)s);
          if (found) {
              fprintf(stderr, "[DEBUG]   -> symbol id=%u\n", (unsigned)it->second);
          }
      }
      return it;
  }
  iterator begin() { return ST.begin(); }
  iterator end()   { return ST.end(); }
  size_t   size() const { return ST.size(); }
};

#endif
