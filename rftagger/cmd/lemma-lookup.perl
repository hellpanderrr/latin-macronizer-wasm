#!/usr/bin/perl

$filename = shift or die "Error: missing argument!\n";
open(FILE,$filename) or die "Error: unable to open file \"$filename\"!\n";
while (<FILE>) {
    chomp;
    my($word,$tag,$lemma) = split(/\t/);
    $lemma{"$word\t$tag"} = $lemma;
}
close FILE;

while (<>) {
    chomp;
    if (exists $lemma{$_}) {
	print "$_\t$lemma{$_}\n";
    }
    else {
	my($word,$tag) = split(/\t/);
	print "$_\t$word\n";
    }
}
