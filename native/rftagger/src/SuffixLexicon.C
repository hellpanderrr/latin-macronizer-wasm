
/*******************************************************************/
/*                                                                 */
/*     File: SuffixLexicon.C                                       */
/*   Author: Helmut Schmid                                         */
/*  Purpose:                                                       */
/*  Created: Mon Oct  1 08:49:04 2007                              */
/* Modified: Mon Oct  1 08:49:13 2007 (schmid)                     */
/* Copyright: Institut fuer maschinelle Sprachverarbeitung         */
/*            Universitaet Stuttgart                               */
/*                                                                 */
/*******************************************************************/


#include "SuffixLexicon.h"


/*******************************************************************/
/*                                                                 */
/*  SNode::lookup                                                  */
/*                                                                 */
/*******************************************************************/

Entry &SNode::lookup( const char *word, int pos )

{
  if (pos >= 0)
    for( size_t i=0; i<link.size(); i++ )
      if (link[i].symbol == word[pos])
	return link[i].node.lookup( word, pos-1 );
  return entry;
}


/*******************************************************************/
/*                                                                 */
/*  SNode::print                                                   */
/*                                                                 */
/*******************************************************************/

void SNode::print( SymbolTable *symtab, FILE *file, char *buffer, int pos ) 
const
{
  fprintf(file,"Suffix=\"");
  for( int i=pos-1; i>=0; i-- )
    fputc( buffer[i], file );
  fputs( "\"\n", file );
  if (symtab)
    entry.print( *symtab, file );
  else
    entry.print( file );
  for( size_t i=0; i<link.size(); i++ ) {
    buffer[pos] = link[i].symbol;
    link[i].node.print( symtab, file, buffer, pos+1);
  }
}
