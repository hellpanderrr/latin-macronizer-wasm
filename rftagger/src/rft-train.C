
/*******************************************************************/
/*                                                                 */
/*     File: rft-train.C                                           */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Thu May 24 12:08:21 2007                              */
/* Modified: Fri May 21 16:11:38 2010 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/

#include "Lexicon.h"
#include "MakeGuesser.h"
#include "LexSmoother.h"
#include "RFBuilder.h"

int Verbose = 1; // controls how much status information is printed

// PARAMETERS FOR REGRESSION TREE TRAINING 

size_t ContextLength = 2;

// Nodes are pruned if the weighted information gain is below PruningThreshold
double PruningThreshold = 6;

// Frequencies are smoothed by adding the parent probabilities
// multiplied with SmoothingWeight. The probabilities are computed
// from the smoothed frequencies
double SmoothingWeight  = 1.0;

// PARAMETERS FOR THE ESTIMATION OF THE LEXICAL PROBABILITIES

// Guesser tags with a probability lower than MinLexProbGuesser * MaxProb
// (where MaxProb is the probability of the most likely tag) are deleted

int    MaxSuffLen = 7;
double GuesserThreshold = 1.0;
double LexSmoothingWeight = 1.0;
double MinLexProbGuesser = 0.001;

char *LexFile=NULL;
char *OCTagsFile=NULL;


/*FA****************************************************************/
/*                                                                 */
/*  usage                                                          */
/*                                                                 */
/*FE****************************************************************/

static void usage()

{
  fprintf(stderr, "\nUsage:  rft-train corpus wc-automaton parfile\n\n");
  fprintf(stderr, "Options\n");
  fprintf(stderr, "-l f supplies additional lexicon entries in file f\n");
  fprintf(stderr, "-o f restricts the possible POS tags of unknown words to those listed in f\n");
  fprintf(stderr, "-c n use n preceding tags as context (default %u)\n", 
	  (unsigned)ContextLength);
  fprintf(stderr, "-p v pruning threshold (default %g)\n", PruningThreshold);
  fprintf(stderr, "-s v smoothing weight for transition probs (default %g)\n", 
	  SmoothingWeight);
  fprintf(stderr, "-ls v smoothing weight for lexical probs (default %g)\n", 
	  LexSmoothingWeight);
  fprintf(stderr, "-g v threshold for suffix tree pruning (default %g)\n", 
	  GuesserThreshold);
  fprintf(stderr, "-lt v pruning threshold for guesser tags (default %g)\n", MinLexProbGuesser);
  fprintf(stderr, "-q   quiet mode\n");
  fprintf(stderr, "-v   verbose mode\n");
  fprintf(stderr, "-vv  very verbose mode\n");
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

      else if (strcmp(opt,"-v") == 0)
	Verbose = 2;

      else if (strcmp(opt,"-vv") == 0)
	Verbose = 3;

      else if (strcmp(opt,"-vvv") == 0)
	Verbose = 4;

      else if (i < argc-1) {
	char *arg = argv[i+1];
	
	if (strcmp(opt,"-c") == 0) {
	  int n = atoi(arg);
	  if (n < 1)
	    errx(1, "Error: context length parameter is out of bounds: %d", n);
	  ContextLength = (size_t)n;
	}
	
	else if (strcmp(opt,"-s") == 0)
	  SmoothingWeight = atof(arg);
	
	else if (strcmp(opt,"-ls") == 0)
	  LexSmoothingWeight = atof(arg);
	
	else if (strcmp(opt,"-lt") == 0)
	  MinLexProbGuesser = atof(arg);
	
	else if (strcmp(opt,"-g") == 0)
	  GuesserThreshold = atof(arg);
	
	else if (strcmp(opt,"-l") == 0)
	  LexFile = arg;
	
	else if (strcmp(opt,"-o") == 0)
	  OCTagsFile = arg;
	
	else if (strcmp(opt,"-p") == 0)
	  PruningThreshold = atof(arg);
	
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

  if (argc != 4)
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

  SymbolTable tagmap;
  tagmap.number("BOUNDARY"); // insert boundary tag

  if (Verbose)
    fprintf(stderr,"reading data...");
  FILE *file = open_file(argv[1],"rt");
  Corpus corpus( tagmap, file );
  fclose( file );

  Sentence *wordlist = NULL;
  if (LexFile) {
    file = open_file(LexFile,"rt");
    wordlist = new Sentence( tagmap, file );
    fclose( file );
  }
  Lexicon lexicon( corpus, wordlist );
  if (wordlist)
    delete wordlist;

  if (Verbose)
    fprintf(stderr,"finished\nbuilding suffix trees for guesser...");
  file = open_file(argv[2],"rt");
  FILE *file2 = NULL;
  if (OCTagsFile)
    file2 = open_file(OCTagsFile, "rt");
  MakeGuesser guesser( file, file2, tagmap, lexicon, GuesserThreshold, 
		       MaxSuffLen, MinLexProbGuesser );
  fclose( file );
  if (file2)
    fclose( file2 );
  if (Verbose)
    fprintf(stderr,"finished\nsmoothing lexicon entries...");

  if (LexFile)
    LexSmoother smoother( lexicon, LexSmoothingWeight );

  if (Verbose)
    fprintf(stderr,"finished\nbuilding trees...\n");
  RFBuilder RFbuilder(corpus, ContextLength, PruningThreshold, 
		      SmoothingWeight, Verbose );

  if (Verbose)
    fprintf(stderr,"finished\nstoring parameters...");
  file = open_file(argv[3],"wb");
  tagmap.store(file);
  lexicon.store(file);
  guesser.store(file);
  RFbuilder.datamapping.store( file );
  RFbuilder.makeforest.store( file );
  write_data( ContextLength, file );
  fclose(file);
  if (Verbose)
    fprintf(stderr,"finished!\n");
}
