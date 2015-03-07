#!/usr/bin/perl -w
#
# $Id: topicbot.pl 268 2008-07-07 17:46:23Z dan $

use strict;
use Net::IRC;
use Digest::MD5;
use Data::Dumper;

$Data::Dumper::Indent = 1;

$|++;

sub Log {
  print scalar localtime, " - @_\n";
}

my @dow = qw/Sun Mon Tue Wed Thu Fri Sat/;

my $config = shift;
open CONFIG, $config or die "Can't read config: $!";

my ($nick, $server, $room, $pass) = split ' ', <CONFIG>;
chomp $pass;
close CONFIG;

$room = "#$room";

my $dir = "/var/www/xkcd/map/data";

my $irc = new Net::IRC;
my $conn =
  $irc->newconn( Nick => $nick, Server => $server, Ircname => 'Topic Bot' );

# $conn->debug(1);
# $conn->add_default_handler( \&irc_default );
$conn->add_handler( endofmotd => \&irc_on_connect );
$conn->add_handler( nomotd    => \&irc_on_connect );
$conn->add_handler( topic     => \&irc_on_topic );

my $hashstring;
my @details;
my $delta = 0;
my $last = "";

while (1) {
  my ($dw, $hw) = &geohash(time + $delta*24*60*60, 0,  \@details);
  my ($de, $he) = &geohash(time + $delta*24*60*60, -1, \@details);

  unless ($dw) {
    $hashstring .= sprintf("%s(E) %s | ", $de, $he);
    last;
  }

  if ($hw ne $he) {
    $hashstring .= sprintf("%s(W) %s | %s(E) %s | ", $dw, $hw, $de, $he);
  } else {
    $hashstring .= sprintf("%s %s | ", $dw, $hw);
    pop @details;
    $details[-1] =~ s/.*:/All:    /;
  }
  
  $delta++;
}

$hashstring =~ s/ \| $//;

my $max = 0;
foreach (@details) { $max = length $_ if length $_ > $max; }
unshift @details, ("=" x $max);
push    @details, ("=" x $max);

#print join "\n", @details;
#print "\n$hashstring\n"; exit;

$irc->start;

Log "Exiting\n";

sub geohash {
    my ($time, $offset, $details) = @_;

    $details = [] unless defined $details;

    my ($day, $month, $year) = (localtime($time))[3,4,5];
    $year += 1900;
    $month++;

    my $datestring = sprintf("%4d-%02d-%02d", $year, $month, $day);

    if ($offset) {
      ($day, $month, $year) = (localtime($time + $offset * 24 * 60 * 60))[3,4,5];
      $year += 1900;
      $month++; 
    }

    my $djia = &get_djia($year, $month, $day);
    return undef unless $djia;
    unless (@$details) {
      push @$details, "DJIA: $djia";
    }

    my $md5 = Digest::MD5::md5_hex("$datestring-$djia");

    my ( $md5x, $md5y ) = ( substr( $md5, 0, 16 ), substr( $md5, 16, 16 ) );
    my ( $fx, $fy ) = ( 0, 0 );
    while ( length $md5x or length $md5y ) {
      my $d = substr( $md5x, -1, 1, "" );
      $fx += hex $d;
      $fx /= 16;
      $d = substr( $md5y, -1, 1, "" );
      $fy += hex $d;
      $fy /= 16;
    } 
    
    if (defined $offset) {
      my $loc = $offset ? "W30:    " : "Non-W30:";
      push @$details, "$loc $datestring,$djia,$fx,$fy";
    } else {
      push @$details, "All:     $datestring,$djia,$fx,$fy";
    }

    return $dow[(localtime($time))[6]], sprintf("%.7f, %.7f" ,$fx, $fy);
}

sub get_djia {
    my ($year, $month, $day) = @_;

    open (DJIA, sprintf("%s/%4d/%02d/%02d", $dir, $year, $month, $day)) or return undef;
    my $djia = <DJIA>;
    close DJIA;

    return $djia;
}

sub irc_on_public {
    my ( $self, $event ) = @_;
    my ( $nick, $mynick ) = ( $event->nick, $self->nick );
    my ($msg) = ( $event->args );

    return unless (($event->to)[0] eq $room);
    Log $event->args;
}

sub irc_on_connect {
    my ( $self, $event ) = @_;

    Log "Identifying";
    $self->privmsg( "nickserv", "identify $pass" );
    sleep 2;

    Log "Joining $room";
    $self->join( $room );
    sleep 5;
    Log "Joined\n";
}

sub irc_on_topic {
    my ( $self, $event ) = @_;

    foreach (@details) {
      $self->privmsg( $room, $_);
    }

    my $topic = ( $event->args )[2];

    $topic =~ s/\s*\| ...\([EW]\).*|\s*\| ... 0\..*//;
    $topic .= " | $hashstring";
    Log "Setting topic to $topic";
    $self->topic($room, $topic);
    exit;
} 

sub irc_default {
  print "$_[1]{type}\n";
}
