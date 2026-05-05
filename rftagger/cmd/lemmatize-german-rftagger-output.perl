#!/usr/bin/perl

use strict;
use Getopt::Std;
use open ':utf8';       # all open() use UTF-8
use open ':std';        # standard filehandles too

our $opt_u;
getopts('u');

# read the lemmatization dictionary
my$filename = shift;
open(FILE, $filename) or die "Error: unable to open \"$filename\"\n";
my %lemma;
while (<FILE>) {
    chomp;
    my($word,$tag,$lemma) = split(/\t/);
    $lemma{"$word\t$tag"} = $lemma;

    # add lemma-tag pairs with (partially) truncated tag
    while ($tag =~ s/^(.*)\..*/$1/) {
	$lemma{"$word\t$tag..."} = $lemma;
    }
}
close FILE;

# do the lemmatization
while (<>) {
    chomp;
    my($word,$tag) = split(/\t/);
    my $lc = lc($word)."\t".$tag;

    if ($_ eq '') {
	# simply print empty lines
	print "\n"
    }
    elsif (exists $lemma{$_}) {
	# lemmatization of a known word
	print "$_\t$lemma{$_}\n";
    }
    elsif (exists $lemma{$lc}) {
	# lemmatization of a capitalized word that is known in lowercase
	print "$_\t$lemma{$lc}\n";
    }
    elsif (/^(.*)-(.+\t.+)$/ && exists $lemma{$2}) {
	# lemmatization of unknown hyphenated words
	print "$1-$2\t$1-$lemma{$2}\n";
    }
    elsif ($tag eq 'CARD') {
	# special lemma for cardinals
	print "$_\t<card>\n";
    }
    elsif ($word =~ /^[0-9.,]+$/ && $tag =~ /^ADJA\.Pos/) {
	# special lemma for ordinals
	print "$_\t<ord>\n";
    }
    else {
	# check if a lemma can be found by generalizing the POS tag
	my $t = $tag;
	my $found;
	while ($t =~ s/^(.*)\..*/$1/) {
	    if (exists $lemma{"$word\t$t..."}) {
		print "$_\t".$lemma{"$word\t$t..."}."\n";
		$found = 1;
		last;
	    }
	}
	
	unless ($found) {
	    # check if a suffix of the current word can be lemmatized
	    for( my $i=1; $i<length($word)-4; $i++ ) {
		my $x = substr($_,$i);
		my $X = ucfirst($x);
		if (exists $lemma{$x}) {
		    my $l = substr($_,0,$i).$lemma{$x};
		    print "$_\t$l\n";
		    $found = 1;
		    last;
		}
		elsif (exists $lemma{$X}) {
		    my $l = substr($_,0,$i).lc($lemma{$X});
		    print "$_\t$l\n";
		    $found = 1;
		    last;
		}
	    }

	    unless ($found) {
		if (defined $opt_u) {
		    print "$_\t$word\n";
		}
		else {
		    print "$_\t<unknown>\n";
		}
	    }
	}
    }
}

