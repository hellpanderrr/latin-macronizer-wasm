
/*******************************************************************/
/*                                                                 */
/*     File: RFDataItem.h                                          */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu May 24 12:40:43 2007                              */
/* Modified: Wed Jun 24 10:48:01 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef RFDATA_ITEM_H
#define RFDATA_ITEM_H

#include <assert.h>
#include <algorithm>

#include <vector>
using std::vector;

#include "Feature.h"

static const size_t INT_BITS=sizeof(int) * 8;

static size_t bitarray_size( size_t n ) {
  return (n + INT_BITS - 1) / INT_BITS;
};


/*****************  class BitVector  *******************************/

class BitVector {

 private:
  size_t size;
  unsigned int *vec;

 public:
  BitVector( size_t n ) {
    size = bitarray_size(n);
    vec = new unsigned int[size];
    for( size_t i=0; i<size; i++ )
      vec[i] = 0;
  }

  BitVector( const BitVector &v ) {
    size = v.size;
    vec = new unsigned int[size];
    for( size_t i=0; i<size; i++ )
      vec[i] = v.vec[i];
  }

  ~BitVector() { delete[] vec; }

  bool get_bit( size_t n ) {
    size_t x = n / INT_BITS;
    size_t y = n % INT_BITS;
    return vec[x] & ((unsigned int)1 << y);
  }

  void set_bit( size_t n ) {
    size_t x = n / INT_BITS;
    size_t y = n % INT_BITS;
    vec[x] |= (unsigned int)1 << y;
  }

  void clear_bit( size_t n ) {
    size_t x = n / INT_BITS;
    size_t y = n % INT_BITS;
    vec[x] &= ~((unsigned int)1 << y);
  }

  void extract_bits( vector<Feature> &m ) {
#include "extract-bits.h"
  }
};


/*****************  class RFDataItem  ******************************/

class RFDataItem {

 private:
  BitVector bitvec;

 public:
  size_t  freq;
  Feature predicted_feature;

 RFDataItem( size_t nof ) : bitvec(nof) {}

  void add_feature( Feature f ) {
    bitvec.set_bit((size_t)f);
  }

  void add_features( vector<Feature> &f ) {
    for( size_t i=0; i<f.size(); i++ )
      bitvec.set_bit((size_t)f[i]);
  }

  bool exists_feature( Feature f ) {
    return bitvec.get_bit((size_t)f);
  }

  void delete_feature( Feature f ) {
    bitvec.clear_bit((size_t)f);
  }

  void build_feature_vector( vector<Feature> &f ) {
    bitvec.extract_bits( f );
  }
};
#endif
