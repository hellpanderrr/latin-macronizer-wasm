#!/usr/bin/perl

use strict;
use utf8::all;

while (<>) {
    if ($_ eq "\n") {
	print;
    }
    else {
	chomp;
	my($w,$t) = split(/\t/);
	$t =~ s/\.//g;
	$t =~ s/-+$//g;
	print "$w\t$t\n";
    }
}
