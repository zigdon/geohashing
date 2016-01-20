#!/usr/bin/perl -wT
#
# $Id: static.cgi 238 2008-06-17 18:48:15Z dan $

use strict;
use Digest::MD5 qw/md5_hex/;
use Date::Manip;
use CGI::Simple;
use CGI::Carp qw/fatalsToBrowser/;
use Geo::Hashing;

my $q = new CGI::Simple;
unless ($q->param()) {
  die "Invalid call";
}

my $debug = 0;
my $URL  = 'http://maps.google.com/maps/api/staticmap?size=%dx%d&markers=%.6f,%.6f';
my $URL2 = 'http://maps.google.com/maps/api/staticmap?size=%dx%d&center=%.6f,%.6f';

foreach ($URL, $URL2) {
  $_ .= '&key=%s&zoom=%s&path=color|weight:2|%d,%d|%d,%d|%d,%d|%d,%d|%d,%d';
}

my %keys = (
 "/carabiner.peeron.com" =>
        "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 "/wiki.xkcd.com"  =>
        "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", 
);
my $key = $keys{"/wiki.xkcd.com"};
foreach (sort {length $b <=> length $a} keys %keys) {
  if ($ENV{HTTP_REFERER} and $ENV{HTTP_REFERER} =~ /$_/i) {
    $key = $keys{$_};
    last;
  }
}

if ($q->param('debug') == 1) {
  print $q->header("text/plain");
  $debug = 1;
}

my ($lat, $lon, $datestring, $w30);
my ($zoom, $width, $height) = (8, 300, 400);

if ($q->param('zoom') =~ /(\d+)/) {
  $zoom = $1;
}
if ($q->param('height') =~ /(\d+)/) {
  $height = $1;
}
if ($q->param('width') =~ /(\d+)/) {
  $width = $1;
}
if ($q->param('lat') =~ /(-?\d+)/) {
  $lat = $1;
}
if ($q->param('lon') =~ /(-?\d+)/) {
  $lon = $1;
  if ($lon >= -30) {
    print "$lon >= -30\n" if $debug;
    $w30 = 1;
  }
}

if ($q->param('date') =~ /(\d\d\d\d-\d\d-\d\d)/) {
  $datestring = $1;
  # W30 doesn't go into effect until 2008-May-27
  my ($year, $month, $day) = split /-/, $datestring;
  if ($year < 2008) {
    $w30 = 0;
  } elsif ($year == 2008 and $month < 5) {
    $w30 = 0;
  } elsif ($year == 2008 and $month == 5 and $day < 27) {
    $w30 = 0;
  }

}

if ($debug) {
  print "w30 = $w30\n";
}

die "Missing params" unless defined $lat and defined $lon;

my $g = new Geo::Hashing(lat => $lat, lon => $lon, date => $datestring, use_30w_rule => $w30);

my ( $px1, $py1, $px2, $py2 ) = ( $lat, $lon );
if ($lat ne "-0" and $lat >= 0) {
  $px2 = $px1 + 1;
} else {
  $px2 = $px1 - 1;
}
if ($lon ne "-0" and $lon >= 0) {
  $py2 = $py1 + 1;
} else {
  $py2 = $py1 - 1;
}

print $q->redirect(sprintf($URL, $width, $height, $g->lat, $g->lon, $key, $zoom,
                           $px1, $py1, $px1, $py2, $px2, $py2, $px2, $py1, $px1, $py1));
