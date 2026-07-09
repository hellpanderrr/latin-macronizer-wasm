#!/usr/bin/perl

while (<>) {
    chomp;
    if ($_ eq '') {
	print "\n"
    }
    else {
	my($w,$t,$l) = split(/\t/);
	
	$t =~ s/^(APPR|CONJ\.Coord)\..*/$1/;
	$t =~ s/\.(Haben|Sein)\./.Aux./;
	$t =~ s/\.-//g;
	
	print "$w\t$t";
	print "\t$l" if defined $l;
	print "\n";
    }
}
