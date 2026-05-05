
/*******************************************************************/
/*                                                                 */
/*     File: io.h                                                  */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jun 14 16:35:39 2007                              */
/* Modified: Wed Jul  2 10:48:07 2014 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#ifndef _IO_H
#define _IO_H

#if defined __MINGW32__ || defined __MINGW64__
#include "err.h"
#else
#include <err.h>
#endif

#include <stdio.h>
#include <string.h>
#include <cstdint>

#include <vector>
using std::vector;

void write_string( const char *p, FILE *file );
char *read_string( FILE *file );
void read_string( char *buffer, FILE *file );
void write_stringvec( const vector<char*> &v, FILE *file );
void read_stringvec( vector<char*> &v, FILE *file );

FILE *open_file( const char *filename, const char *flags );

template <class T> void write_data( const T &a, FILE *file ) {
  fwrite( &a, sizeof(T), 1, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
}

template <class T> void read_data( T &a, FILE *file ) {
  fread( &a, sizeof(T), 1, file );
  if (ferror(file))
    errx(1,  "Error encountered while reading from file");
}

// Use fixed-width 64-bit integer for model size fields (model written on 64-bit Linux)
inline void read_size( uint64_t &a, FILE *file ) {
  fread( &a, sizeof(uint64_t), 1, file );
  if (ferror(file))
    errx(1, "Error encountered while reading size");
}

inline void write_size( uint64_t a, FILE *file ) {
  fwrite( &a, sizeof(uint64_t), 1, file );
  if (ferror(file))
    errx(1, "Error encountered while writing size");
}

template <class T> void write_datavec( const vector<T> &v, FILE *file ) {
  write_size( v.size(), file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  for( size_t i=0; i<v.size(); i++ )
    v[i].store( file );
}

template <class T> void read_datavec( vector<T> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.clear();
  v.reserve(n);
  for( size_t i=0; i<n; i++ )
    v.push_back(T(file));
}

template <class T> void write_basedatavec( const vector<T> &v, FILE *file ) {
  write_size( v.size(), file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  for( size_t i=0; i<v.size(); i++ )
    write_data( v[i], file );
}

template <class T> void read_basedatavec( vector<T> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    v[i].restore( file );
}

// Specialization for primitive types (double, float, int, etc.)
inline void read_basedatavec( vector<double> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    read_data( v[i], file );
}

inline void read_basedatavec( vector<float> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    read_data( v[i], file );
}

inline void read_basedatavec( vector<int> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while writing to file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    read_data( v[i], file );
}

inline void read_basedatavec( vector<unsigned short> &v, FILE *file ) {
  uint64_t n;
  read_size( n, file );
  if (ferror(file))
    errx(1, "Error encountered while reading from file");
  v.resize(n);
  for( size_t i=0; i<n; i++ )
    read_data( v[i], file );
}

#endif
