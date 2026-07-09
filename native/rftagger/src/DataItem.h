
/*******************************************************************/
/*                                                                 */
/*     File: DataItem.h                                            */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Oct 10 12:07:55 2007                              */
/* Modified: Wed Oct 10 12:57:51 2007 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#ifndef DATA_ITEM_H
#define DATA_ITEM_H

#include <vector>
using std::vector;

#include "Feature.h"


/*****************  class DataItem  ********************************/

class DataItem {
public:
  size_t freq;
  Feature predicted_feature;
  vector<Feature> feature;
  
 DataItem( Feature pf, vector<Feature> &f )
   : freq(0), predicted_feature(pf), feature(f) {}

  bool has_feature( Feature f ) {
    for( size_t i=0; i<feature.size(); i++ )
      if (feature[i] == f)
	return true;
    return false;
  }

  bool operator==( const DataItem &item ) const {
    if (predicted_feature != item.predicted_feature)
      return false;
    for( size_t i=0; i<feature.size(); i++ )
      if (feature[i] != item.feature[i])
	return false;
    return true;
  }

  size_t hashf() const { 
    size_t result = predicted_feature;
    for( size_t i=0; i<feature.size(); i++ ) {
      size_t x = i % 32;
      result ^= ((size_t)feature[i] << x) | (size_t)feature[i] >> (32-x);
    }
    return result;
  }
};

#endif
