
/*******************************************************************/
/*                                                                 */
/*     File: io.C                                                  */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun 15 12:10:52 2007                              */
/* Modified: Wed Jun 24 10:37:37 2009 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include <string.h>

#include "io.h"


void write_string( const char *p, FILE *file )
{
  do { fputc( *p, file); } while (*(p++));
}


char *read_string( FILE *file )
{
  char buffer[10000];
  for( size_t i=0; (buffer[i] = (char)fgetc(file)); i++ )
    if (i == 9999)
      errx(1, "Error: while reading string from file (string too long)");
  return strdup(buffer);
}


void read_string( char *buffer, FILE *file )
{
  for( size_t i=0; (buffer[i] = (char)fgetc(file)); i++ ) ;
}


void write_stringvec( const vector<char*> &v, FILE *file ) {
  write_size( v.size(), file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  for( size_t i=0; i<v.size(); i++ )
    write_string( v[i], file );
}

void read_stringvec( vector<char*> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    v[i] = read_string(file);
}

FILE *open_file( const char *filename, const char *flags )
{
  FILE *file = fopen(filename, flags);
  if (file == NULL)
    errx(1,"Error: unable to open file \"%s\"", filename);
  return file;
}
