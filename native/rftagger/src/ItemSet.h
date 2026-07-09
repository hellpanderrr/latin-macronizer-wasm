
/*MA****************************************************************/
/*                                                                 */
/*     File: ItemSet.h                                             */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu Jan  2 14:55:10 2003                              */
/* Modified: Thu Sep 11 15:59:55 2008 (schmid)                     */
/*                                                                 */
/*ME****************************************************************/

#ifndef ITEM_SET_H
#define ITEM_SET_H

#include <stdio.h>

#include <vector>
using std::vector;

#include "DataItem.h"

#include "sgi.h"


/*****************  class ItemSet  *********************************/

class ItemSet {

private:

  struct hashf {
    size_t operator()( const DataItem *item ) const {
      return item->hashf();
    }
  };

  struct cmp {
    size_t operator()( const DataItem *i, const DataItem *i2 ) const {
      return (*i == *i2);
    }
  };

  typedef hash_set<DataItem*, hashf, cmp> Item_Set;

  Item_Set IS;

public:
  typedef Item_Set::iterator iterator;

  DataItem *operator()( DataItem *item ) {
    iterator it = IS.find(item);
    if (it != end())
      return *it;
    IS.insert( item );
    return item;
  };

  iterator begin() { return IS.begin(); }
  iterator end()   { return IS.end(); }
  size_t   size() const { return IS.size(); }
  void     clear() { IS.clear(); }
};

#endif

