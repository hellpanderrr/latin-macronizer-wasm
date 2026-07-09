
/*******************************************************************/
/*                                                                 */
/*     File: rft-print.C                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun  1 14:33:56 2007                              */
/* Modified: Fri Jul 27 18:37:17 2007 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "POSTagger.h"


/*******************************************************************/
/*                                                                 */
/*  main                                                           */
/*                                                                 */
/*******************************************************************/


int main( int argc, char **argv )

{
  FILE *file;

  if (argc < 2) {
    fprintf(stderr, "Usage: rft-print parfile\n");
    exit(1);
  }

  if ((file = fopen(argv[1], "rb")) == NULL)
    errx(1, "Error: unable to open file \"%s\"", argv[1]);
  POSTagger tagger(file);
  fclose(file);

  tagger.print(stdout);
}
