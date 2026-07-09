#!/usr/bin/perl -i
###################################################################
###      File: /home/users2/schmid/src/TBProgs/KM/f.perl        ###
###    Author: Helmut Schmid                                    ###
###   Purpose:                                                  ###
###   Created: Mon Jul 25 16:05:39 2005                         ###
###  Modified: Thu May 10 10:00:43 2007 (schmid)                ###
### Copyright: Institut fuer maschinelle Sprachverarbeitung     ###
###               Universitaet Stuttgart                        ###
###################################################################

while (<>) {
  if (/^ *%/) {
    print;
    next;
  }
  if (/^ *\$X[0-9]*\$ *=/) {
    $n = 1;
    for($k=1; $n<=$T; $k++) {
      $out = "\$X$k\$ = \$T$n\$";
      for($i=1; $i<=8 && ++$n<=$T; $i++ ) {
	$out .= " | \$T$n\$";
      }
      print "$out\n";
    }
    $out = "\$X1\$";
    for( $i=2; $i<$k; $i++ ) {
      $out .= " | \$X$i\$";
    }
    print "\n$out\n";
    last;
  }
  if (/\$T[0-9]*\$/) {
    $T++;
    s/\$T[0-9]*\$/\$T$T\$/;
  }
  if (/<[0-9]*>/) {
    $C++;
    s/<[0-9]*>/<$C>/;
  }
  print;
}
