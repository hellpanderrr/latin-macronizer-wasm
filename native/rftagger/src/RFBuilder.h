
/*******************************************************************/
/*                                                                 */
/*     File: RFBuilder.h                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Wed May 30 12:02:47 2007                              */
/* Modified: Mon Jan 12 15:09:32 2009 (schmid)                     */
/*                                                                 */
/*******************************************************************/

#include "Corpus.h"
#include "DataMapping.h"
#include "RFData.h"
#include "MakeRegressionForest.h"


/*****************  class RFBuilder  *******************************/

class RFBuilder {

  size_t context_length;
  void make_data( Corpus& );

 public:

  DataMapping datamapping;
  RFData rfdata;
  MakeRegressionForest makeforest;

  RFBuilder( Corpus &corpus, size_t ContextLength, double prune, 
	     double smooth, int verb );

};
