
/*******************************************************************/
/*                                                                 */
/*     File: RFData.h                                              */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed Jul 18 12:44:56 2007                              */
/* Modified: Wed Jun 24 10:38:17 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "ItemSet.h"


/*****************  class RFData  **********************************/

class RFData {

private:
  ItemSet ItemHash;

public:
  vector<DataItem*> item;

  ~RFData() {
    for( size_t i=0; i<item.size(); i++ )
      delete item[i];
  }

  void add_item( vector<Feature> &features, Feature predicted_feature ) {
    DataItem *d = new DataItem( predicted_feature, features );
    DataItem *rep = ItemHash(d);
    if (rep == d)
      item.push_back( d ); // new item
    else
      delete d;
    rep->freq++;
  }
};

