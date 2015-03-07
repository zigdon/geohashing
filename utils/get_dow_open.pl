#!/usr/bin/perl -w
#
# $Id: get_dow_open.pl 682 2009-08-03 15:06:13Z dan $

use strict;
use HTML::TreeBuilder;
use LWP::Simple;
use Date::Calc qw/Today Day_of_Week Add_Delta_Days/;
use File::Copy;
use Date::Calendar::Profiles qw/ $Profiles /;
use Date::Calendar;

my $URL = "http://finance.google.com/finance?q=INDEXDJX:.DJI";
my $datadir = "/var/www/xkcd/map/data";
my $datafile = "/var/www/xkcd/map/dow.js";
my $current = "$datadir/current";

my $quick = shift;

open(CURRENT, $current) or die "Can't read $current: $!";
my $current_djia = <CURRENT>;
chomp $current_djia;
close CURRENT;

my @lines;
open (DATAFILE, $datafile) or die "Can't read $datafile: $!";
my $header = scalar <DATAFILE>;
while (<DATAFILE>) {
  push @lines, $_;
  shift @lines if @lines > 10;
}
close DATAFILE;
unshift @lines, $header;

my $open;
my $starttime = time;
my $err = 0;
while (sleep 1) {
  die "Too many errors!" if $err > 60;
  my $page = get $URL or warn "Can't get $URL: $!" and sleep 10 and next;;
  my $tree = HTML::TreeBuilder->new_from_content($page) or &log("no tree!") and $err++ and next;
  my $data = $tree->look_down(id => "market-data-div") or &log("no div!") and $err++ and next;
  my ($td) = $data->look_down(class => "key", sub {$_[0]->as_text =~ /Open/i});
  if ($td) {
    $td = $td->right;
  } else {
    $tree->delete;
    sleep 30;
    next;
  }

  my @date = localtime;
  if ($td) {
    $open = $td->as_text;
    $open =~ s/[^\d.]+//g;
  } else {
    $open = undef;
  }

  $err = 0;

  if (not $open or $open == $current_djia) {
    if ($open and $open == $current_djia and $quick) {
      &log("DJIA still at $current_djia.  No change found.");
      exit;
    }
    &log("DJIA not available yet - current value is $current_djia, ",
          "new values is ", ($td ? $td->as_text : "N/A"));

    if (time - $starttime > 60*60) {
      &log("It's been an hour, assuming the market is closed.");
    } else {
      $tree->delete;
      sleep 30;
      next;
    }
  }


  push @lines, sprintf "data['%d-%02d-%02d']=%.2f\n", 1900+$date[5], $date[4]+1, $date[3], $open;
  &write_data(1900+$date[5], $date[4]+1, $date[3], $open);

  # keep adding days, until we get to the next workday
  my $delta = 1;
  my $calendar = Date::Calendar->new( $Profiles->{'US'} );
  $calendar->cache_add(1900+$date[5]);
  my $holiday = 1;
  my %djia_holidays = map {$_=>1}
                        ("Saturday", "Sunday", "New Year's Day", 
                         "Martin Luther King's Birthday", "Labor Day",
                         "President's Day", "Good Friday",
                         "Memorial Day", "Independence Day",
                         "Thanksgiving Day", "Christmas Day");

  while ($holiday) {
    $holiday = "";
    my @newdate = Add_Delta_Days(1900+$date[5], $date[4]+1, $date[3], $delta);
    foreach my $label ($calendar->labels(@newdate)) {
      if (exists $djia_holidays{$label}) {
        $holiday = $label;
        last;
      }
    }
    last unless $holiday;

    &log("@newdate is a holiday ($holiday)");
    push @lines, sprintf "data['%d-%02d-%02d']=%.2f\n", @newdate, $open;
    &write_data(@newdate, $open);
    $delta++;
  }

  $tree->delete;
  last;
}

&log("DJIA for today is '$open'");

open(DATAFILE, ">$datafile.new") or die "Can't write to $datafile.new: $!";
print DATAFILE @lines;
close DATAFILE;
move "$datafile.new", $datafile or die "Can't rename $datafile.new: $!";

open(CURRENT, ">$current") or die "Can't write $current: $!";
print CURRENT $open;
close CURRENT;

system("/home/zigdon/lib/xkcd/topicbot.pl");

sub write_data {
  my ($year, $month, $day, $open) = @_;

  mkdir "$datadir/$year";
  mkdir sprintf("$datadir/%04d/%02d", $year, $month);
  open DATA, sprintf(">$datadir/%04d/%02d/%02d", $year, $month, $day) or
    die sprintf("Can't write to $datadir/%04d/%02d/%02d: $!", $year, $month, $day);
  print DATA $open;
  close DATA;
}

sub log {
  print scalar localtime, " - @_\n";
}
