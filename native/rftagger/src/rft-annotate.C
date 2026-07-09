
/*******************************************************************/
/*                                                                 */
/*     File: rft-annotate.C                                        */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Fri Jun  1 14:33:56 2007                              */
/* Modified: Thu Jul 26 17:15:56 2012 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "POSTagger.h"

int Verbose=1;
bool Normalize = true;
bool SentStartHeuristic = false;
bool HyphenationHeuristic = false;
double BeamThreshold=0.001;


/*FA****************************************************************/
/*                                                                 */
/*  usage                                                          */
/*                                                                 */
/*FE****************************************************************/

static void usage()

{
  fprintf(stderr, "\nUsage:  rft-annotate parfile [infile [outfile]]\n\n");
  fprintf(stderr, "Options\n");
  fprintf(stderr, "-t v beam threshold\n");
  fprintf(stderr, "-u   no normalization of probabilities\n");
  fprintf(stderr, "-s   consider the lower-case version of sentence-initial words\n");
  fprintf(stderr, "-hh  hyphenation heuristic: lookup \"prone\" if \"error-prone\" is not in the lexicon\n");
  fprintf(stderr, "-q   quiet mode\n");
  fprintf(stderr, "-v   verbose mode\n");
  fprintf(stderr, "-h   this message\n");
  exit(1);
}


/*FA****************************************************************/
/*                                                                 */
/*  get_flags                                                      */
/*                                                                 */
/*FE****************************************************************/

static void get_flags( int &argc, char **argv )

{
  for( int i=1; i<argc; i++ )
    if (argv[i][0] == '-') {
      char *opt = argv[i];

      if (strcmp(opt,"-h") == 0)
	usage();
      else if (strcmp(opt,"-q") == 0)
	Verbose = 0;

      else if (strcmp(opt,"-u") == 0)
	Normalize = false;
	
      else if (strcmp(opt,"-s") == 0)
	SentStartHeuristic = true;
	
      else if (strcmp(opt,"-hh") == 0)
	HyphenationHeuristic = true;
	
      else if (strcmp(opt,"-v") == 0)
	Verbose = 2;

      else if (i < argc-1) {
	char *arg = argv[i+1];
	
	if (strcmp(opt,"-t") == 0)
	  BeamThreshold = atof(arg);
	
	else
	  errx(1, "Error: unrecognized option \"%s\"", opt);
	argv[i++] = NULL;
      }	
      else
	errx(1, "Error: unrecognized option \"%s\"", opt);

      argv[i] = NULL;
    }

  // remove flags from the argument list
  int k;
  for( int i=k=1; i<argc; i++)
    if (argv[i] != NULL)
      argv[k++] = argv[i];

  argc = k;
  if (argc < 2)
    usage();
}


/*******************************************************************/
/*                                                                 */
/*  main                                                           */
/*                                                                 */
/*******************************************************************/


int main( int argc, char **argv )

{
  get_flags( argc, argv );

  if (argc < 2)
    usage();

  if (Verbose)
    fprintf(stderr,"reading parameter file...");
  FILE *file = open_file(argv[1], "rb");
  POSTagger tagger(file, Normalize, BeamThreshold, SentStartHeuristic, HyphenationHeuristic);
  fclose(file);
  if (Verbose)
    fprintf(stderr,"finished\n");

  file = (argc > 2) ? open_file(argv[2], "rt") : stdin;
  FILE *outfile = (argc > 3) ? open_file(argv[3], "wt") : stdout;
  for( size_t line=0; ; line++ ) {
    if (Verbose)
      fprintf(stderr, "\r%u", (unsigned) line);

    Sentence sent( file );
    if (sent.token.size() == 0)
      break;
    tagger.annotate( sent );
    sent.print( tagger.tagmap, outfile );
  }
  if (Verbose)
    fputc('\n', stderr);
  fclose(file);
  fclose(outfile);
}
