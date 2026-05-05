
# TYPE is either debug, prof, lprof, static, lib or the empty string
TYPE=

BIN=.

# Try different definitions of SGILIB if hash_map is not found
SGILIB=-DSGI__gnu_cxx
#SGILIB=-DSGIext
#SGILIB=

DESTDIR =
PREFIX = /usr/local/

CC = g++
WARNING = -Wall -Wcast-qual -Wconversion -Wno-deprecated -std=c++11

ifeq ($(TYPE),debug)
  DEBUG = -ggdb
  OPTIMIZATION = -O0
else
  DEBUG = -DNDEBUG
  ifeq ($(TYPE),prof)
    OPTIMIZATION = -O4
    PROFILE = -pg
  else
    ifeq ($(TYPE),lprof)
      OPTIMIZATION = -O4
      PROFILE = -pg -g
    else
      OPTIMIZATION = -O4
      ifeq ($(TYPE),static)
        STATIC = -static
      else
        ifeq ($(TYPE),lib)
          LIB = -fPIC
        endif
      endif
    endif
  endif
endif

CL = $(CC)
CFLAGS = $(DEBUG) $(PROFILE) $(OPTIMIZATION) $(WARNING) $(SGILIB) $(LIB)
LDFLAGS = $(DEBUG) $(PROFILE) $(STATIC) -lm

CXXFLAGS = $(CFLAGS)
LXXFLAGS = $(LDFLAGS)

INSTALL = install
INSTALL_MANPAGES = install

PROGRAMS = $(BIN)/rft-train $(BIN)/rft-print $(BIN)/rft-annotate

TARGET = $(PROGRAMS)
ifeq ($(TYPE),lib)
TARGET = $(PROGRAMS) library
endif



.PHONY: all clean archive remake install maninstall

all: $(TARGET)
	strip $(PROGRAMS)

$(BIN)/rft-train: io.o Entry.o Lexicon.o LexSmoother.o MakeGuesser.o MakeSuffixLexicon.o \
	DataMapping.o MakeRegressionForest.o RFBuilder.o rft-train.o
	$(CL) -o $@ $^ $(LDFLAGS)

$(BIN)/rft-print: rft-print.o io.o DataMapping.o SuffixLexicon.o POSTagger.o
	$(CL) -o $@ $^ $(LDFLAGS)

$(BIN)/rft-annotate: rft-annotate.o io.o DataMapping.o SuffixLexicon.o \
	POSTagger.o
	$(CL) -o $@ $^ $(LDFLAGS)


library: rft-annotate.o io.o DataMapping.o SuffixLexicon.o POSTagger.o c-wrapper.o
	$(CL) -shared -Wl,-soname,libRFTagger.so -o libRFTagger.so $^ $(LDFLAGS)


install: all
	for p in $(PROGRAMS); do $(INSTALL) $$p $(DESTDIR)$(PREFIX)bin/$$p; done

maninstall:
	for m in man1/*.1; do $(INSTALL_MANPAGES) $$m $(DESTDIR)$(PREFIX)man/$$m; done

clean:
	-rm *.o *~ $(PROGRAMS) Makefile.bak 2>&- > /dev/null

remake: clean all

archive:
	gtar -zcf BAK-`date '+%y%m%d'`.tar.gz *.[cCh] Makefile

Makefile: *.C *.h
	-makedepend -Y -- $(CFLAGS) -- *.C 2>/dev/null 


# DO NOT DELETE

c-wrapper.o: POSTagger.h Prob.h Lexicon.h SymbolTable.h sgi.h Entry.h io.h
c-wrapper.o: Corpus.h Guesser.h WordClass.h SuffixLexicon.h DataMapping.h
c-wrapper.o: Feature.h RegressionForest.h RFDataItem.h extract-bits.h
DataMapping.o: io.h DataMapping.h SymbolTable.h sgi.h Feature.h
Entry.o: Entry.h SymbolTable.h sgi.h io.h
io.o: io.h
Lexicon.o: Lexicon.h SymbolTable.h sgi.h Entry.h io.h Corpus.h
LexSmoother.o: Lexicon.h SymbolTable.h sgi.h Entry.h io.h Corpus.h
LexSmoother.o: LexSmoother.h
MakeGuesser.o: MakeGuesser.h Lexicon.h SymbolTable.h sgi.h Entry.h io.h
MakeGuesser.o: Corpus.h WordClass.h MakeSuffixLexicon.h
MakeRegressionForest.o: DataMapping.h SymbolTable.h sgi.h Feature.h
MakeRegressionForest.o: MakeRegressionForest.h DataItem.h RegressionForest.h
MakeRegressionForest.o: io.h RFDataItem.h extract-bits.h
MakeSuffixLexicon.o: MakeSuffixLexicon.h Entry.h SymbolTable.h sgi.h io.h
POSTagger.o: POSTagger.h Prob.h Lexicon.h SymbolTable.h sgi.h Entry.h io.h
POSTagger.o: Corpus.h Guesser.h WordClass.h SuffixLexicon.h DataMapping.h
POSTagger.o: Feature.h RegressionForest.h RFDataItem.h extract-bits.h
RFBuilder.o: RFBuilder.h Corpus.h io.h SymbolTable.h sgi.h DataMapping.h
RFBuilder.o: Feature.h RFData.h ItemSet.h DataItem.h MakeRegressionForest.h
RFBuilder.o: RegressionForest.h RFDataItem.h extract-bits.h
rft-annotate.o: POSTagger.h Prob.h Lexicon.h SymbolTable.h sgi.h Entry.h io.h
rft-annotate.o: Corpus.h Guesser.h WordClass.h SuffixLexicon.h DataMapping.h
rft-annotate.o: Feature.h RegressionForest.h RFDataItem.h extract-bits.h
rft-print.o: POSTagger.h Prob.h Lexicon.h SymbolTable.h sgi.h Entry.h io.h
rft-print.o: Corpus.h Guesser.h WordClass.h SuffixLexicon.h DataMapping.h
rft-print.o: Feature.h RegressionForest.h RFDataItem.h extract-bits.h
rft-train.o: Lexicon.h SymbolTable.h sgi.h Entry.h io.h Corpus.h
rft-train.o: MakeGuesser.h WordClass.h MakeSuffixLexicon.h LexSmoother.h
rft-train.o: RFBuilder.h DataMapping.h Feature.h RFData.h ItemSet.h
rft-train.o: DataItem.h MakeRegressionForest.h RegressionForest.h
rft-train.o: RFDataItem.h extract-bits.h
SuffixLexicon.o: SuffixLexicon.h Entry.h SymbolTable.h sgi.h io.h
