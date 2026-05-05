#!/usr/bin/perl

print STDERR "reading data...";
while (<>) {
    chomp;
    my($from,$to,$sym,$sym2) = split(/\t/);
    if (defined $sym2 && $sym eq $sym2) {
        if ($sym =~ /^<([0-9]+)>$/) {
            if (!exists $wordclass{$from} || $wordclass{$from} > $1) {
                $wordclass{$from} = $1;
            }
        }
        else {
            push @trans, "$from\t$sym\t$to\n";
        }
    }
    elsif (!defined $from || defined $to) {
        die;
    }
}

print STDERR "finished\nsorting...";
foreach $t (sort compare @trans) {
  print $t;
}

foreach $s (sort {$a <=> $b} keys %wordclass) {
  print "$s\twordclass\t$wordclass{$s}\n";
}
print STDERR "finished\n";


sub compare {
  my @A=split(/\t/,$a);
  my @B=split(/\t/,$b);
  return ($A[0]-$B[0] || $A[1] cmp $B[1]);
}
