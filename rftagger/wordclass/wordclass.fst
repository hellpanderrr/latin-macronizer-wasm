
% lowercase vowels
$v$ = [aeiouäöüyäëïöüâêîôûáéíóúàèìòùã]

% upperercase vowels
$V$ = [AEIOUÄÖÜY]

% lowercase consonants
$c$ = [bcdfghjklmnpqrstvwxzß]

% uppercase consonants
$C$ = [BCDFGHJKLMNPQRSTVWXZ]

% all lowercase letters
$l$ = [a-zäëïöüâêîôûáéíóúàèìòùãßç]

% all uppercase letters
$L$ = [A-ZÄÖÜÁÉ]

% all letters
$x$ = $L$ | $l$

% other characters
$s$ = [$&'()*+\,./0-9:_`\%"\!\?&;()@=§\-]

% definition of the alphabet
ALPHABET = $L$ $l$ $s$

% You can modify the word class expressions below and
% add additional expressions. You can also modify the
% character class definitions above. See the SFST manual
% for information on the SFST syntax used here.

$T1$ = (\
  % numeric expressions
  [+\-]?[0-9][0-9,./:\-]* <1> |\
  % capitalized words
  $L$ .* <2> |\
  % lower-case words
  $l$ .* <3>)

$X1$ = $T1$

$X1$
