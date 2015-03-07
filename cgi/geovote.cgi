#!/usr/bin/perl -wT
#
# $Id: geovote.cgi 246 2008-06-18 06:38:25Z dan $

use lib qw#/home/zigdon/lib/xkcd#;

use strict;
use CGI;
use CGI::Carp qw/fatalsToBrowser/;
use DBI;
use JSON;
use Geohashing::Schema;
use Date::Calc qw/Delta_Days Today/;

my $db_user = 'www';
my $db_pass = '';
my $db_name = 'geohashing';

my $q = new CGI;
die "Invalid call" unless $q->param;

my $db = Geohashing::Schema->connect( "DBI:mysql:$db_name", $db_user, $db_pass, undef );
die "Failed to connect to database!" unless $db;

my %p;
my %def = ( action   => qr/addMeetup|getMeetups|voteMeetup|voteDefaultMeetup/,
            lat      => qr/-?\d+(?:\.\d+)?/,
            lon      => qr/-?\d+(?:\.\d+)?/,
            date     => qr/\d\d\d\d-\d\d-\d\d/,
            meetupid => qr/\d+/,
            vote     => qr/yes|no|unyes/,
            dist     => qr/\d+(?:\.\d+)?/,
          );

foreach (keys %def) {
  if (defined $q->param($_)) {
    if ($q->param($_) =~ /^($def{$_})$/) {
      $p{$_} = $1;
    } else {
      &error("Invalid value for $_");
      warn "Invalid value for $_: ", $q->param($_);
    }
  }
}

if ($q->param('debug')) {
  print $q->header;
  print "Debug mode: ", $q->Dump();
}

&error("Missing or invalid action!") unless $p{action};

my $ip = $ENV{REMOTE_ADDR};

if ($p{action} eq 'addMeetup') {
  &addMeetup($p{lat}, $p{lon}, $p{date}, $ip);
} elsif ($p{action} eq 'getMeetups') {
  &getMeetups($p{lat}, $p{lon}, $p{date}, $p{dist});
} elsif ($p{action} eq 'voteMeetup') {
  &voteMeetup($p{meetupid}, $p{vote}, $ip);
} elsif ($p{action} eq 'voteDefaultMeetup') {
  &voteDefaultMeetup($p{lat}, $p{lon}, $p{date}, $p{vote}, $ip);
} else {
  die "THE WORLD IS ENDING!!!";
}

sub error {
  &result({err => $_[0]});
  exit;
}

sub result {
  my $data = shift;

  print $q->header("text/x-json");
  print to_json($data);
}

sub voteMeetup {
  my ($id, $vote, $ip) = @_;

  &error("Missing required parameters!") unless defined $id and $vote;

  my $meetup = $db->resultset('Meetup')->find($id);
  unless ($meetup) {
    &error("Can't find meetup #$id");
  }

  &verifyDate($meetup->date);

  if ($vote eq 'yes') {
    # remove an old no vote
    my ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                     meetupid => $id,
                                                     vote     => 'no',
                                                     action   => 'voteMeetup',
                                                     revoked  => 'no'});
    if ($oldvote) {
      &revoke('no', $meetup, $oldvote);
    }

    # remove any yes votes elsewhere in the grat
    my (@alts) = $db->resultset('Meetup')->search({abslat => $meetup->abslat,
                                                   abslon => $meetup->abslon,
                                                   date   => $meetup->date});
    foreach my $alt (@alts) {
      my ($oldyes) = $db->resultset('Audit')->search({ip       => $ip,
                                                      meetupid => $alt->id,
                                                      vote     => 'yes',
                                                      action   => 'voteMeetup',
                                                      revoked  => 'no'});
      if ($oldyes) {
        if ($alt->id == $meetup->id) {
          &revoke('yes', $meetup, $oldyes, 'nodelete');
        } else {
          &revoke('yes', $alt, $oldyes);
        }
      }
    }

    $meetup->yes($meetup->yes + 1); 
  } elsif ($vote eq 'no') {
    # remove an old yes vote for this point
    my ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                     meetupid => $id,
                                                     vote     => 'yes',
                                                     action   => 'voteMeetup',
                                                     revoked  => 'no'});
    if ($oldvote) {
      &revoke('yes', $meetup, $oldvote, 'nodelete');
    }

    ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                  meetupid => $id,
                                                  vote     => 'no',
                                                  action   => 'voteMeetup',
                                                  revoked  => 'no'});
    if ($oldvote) {
      &revoke('no', $meetup, $oldvote);
    }

    $meetup->no($meetup->no + 1);
  } else {
    &error("Unknown vote $vote");
  }

  $db->resultset('Audit')->create({ip       => $ip,
                                   meetupid => $id,
                                   vote     => $vote,
                                   action   => 'voteMeetup'});

  if ($meetup->yes > 0) {
    $meetup->update;
  } else {
    warn "Removing empty meetup ", $meetup->id, "\n";
    &result({yes => $meetup->yes, no => $meetup->no});
    $meetup->delete;
    return;
  }

  &result({yes => $meetup->yes, no => $meetup->no});
}

sub voteDefaultMeetup {
  my ($lat, $lon, $date, $vote, $ip) = @_;

  &error("Missing required parameters!") unless defined $lat and $lon and $date and $vote;

  &verifyDate($date);

  my ($meetup) = $db->resultset('Meetup')->find_or_create({ date     => $date,
                                                            abslat   => int($lat),
                                                            abslon   => int($lon),
                                                            lat      => int($lat),
                                                            lon      => int($lon),
                                                            official => 1,
                                                         });
  unless ($meetup) {
    &error("Can't find meetup for $lat/$lon/$date");
  }

  if ($vote eq 'yes') {
    # remove an old no vote
    my ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                     meetupid => $meetup->id,
                                                     vote     => 'no',
                                                     action   => 'voteMeetup',
                                                     revoked  => 'no'});
    if ($oldvote) {
      &revoke('no', $meetup, $oldvote);
    }

    # remove any yes votes elsewhere in the grat
    my (@alts) = $db->resultset('Meetup')->search({abslat => $meetup->abslat,
                                                   abslon => $meetup->abslon,
                                                   date   => $meetup->date});
    foreach my $alt (@alts) {
      my ($oldyes) = $db->resultset('Audit')->search({ip       => $ip,
                                                      meetupid => $alt->id,
                                                      vote     => 'yes',
                                                      action   => 'voteMeetup',
                                                      revoked  => 'no'});
      if ($oldyes) {
        if ($alt->id == $meetup->id) {
          &revoke('yes', $meetup, $oldyes, 'nodelete');
        } else {
          &revoke('yes', $alt, $oldyes);
        }
      }
    }

    $meetup->yes($meetup->yes + 1); 
  } elsif ($vote eq 'no') {
    # remove an old yes vote for this point
    my ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                     meetupid => $meetup->id,
                                                     vote     => 'yes',
                                                     action   => 'voteMeetup',
                                                     revoked  => 'no'});
    if ($oldvote) {
      &revoke('yes', $meetup, $oldvote, 'nodelete');
    }

    ($oldvote) = $db->resultset('Audit')->search({ip       => $ip,
                                                  meetupid => $meetup->id,
                                                  vote     => 'no',
                                                  action   => 'voteMeetup',
                                                  revoked  => 'no'});
    if ($oldvote) {
      &revoke('no', $meetup, $oldvote);
    }

    $meetup->no($meetup->no + 1);
  } else {
    &error("Unknown vote $vote");
  }

  $db->resultset('Audit')->create({ip       => $ip,
                                   meetupid => $meetup->id,
                                   vote     => $vote,
                                   action   => 'voteMeetup'});

  $meetup->update;
  &result({yes => $meetup->yes, no => $meetup->no});
}

sub getMeetups {
  my ($lat, $lon, $date, $dist) = @_;

  &error("Missing required parameters!")
    unless defined $lat and defined $lon and $date;

  my @res;
  my ($official) = $db->resultset('Meetup')->search({ date     => $date,
                                                      abslat   => int($lat),
                                                      abslon   => int($lon),
                                                      lat      => int($lat),
                                                      lon      => int($lon),
                                                      official => 1,
                                                   });
  if ($official) {
    push @res, { meetupid => $official->id, 
                 display  => 0,
                 lat      => $official->lat,
                 lon      => $official->lon, 
                 yes      => $official->yes, 
                 no       => $official->no,
                 official => 1,
               };
  } else {
    push @res, {yes => 0, no => 0, official => 1};
  }

  my ($offy, $offx) = ($lat - int($lat), $lon - int($lon));
  my @meetups = $db->resultset('Meetup')->search({ date     => $date,
                                                   abslat   => {-in => 
                                                                [ int($lat),
                                                                  int($lat) + ($offy > 0.5  ?  1 :
                                                                               $offy < -0.5 ? -1 :
                                                                               $offy > 0    ? -1 :
                                                                                               1)
                                                                ]
                                                               },
                                                   abslon   => {-in => 
                                                                [ int($lon),
                                                                  int($lon) + ($offx > 0.5  ?  1 :
                                                                               $offx < -0.5 ? -1 :
                                                                               $offx > 0    ? -1 :
                                                                                               1)
                                                                ]
                                                               },
                                                   official => 0,
                                                 }, { order_by => 'PK_ID' });

  my $id = 1;
  foreach my $meetup (@meetups) {
    if (int($meetup->lat) == int($lat) and int($meetup->lon) != int($lon)) {
      if (abs($offx) > 0.5) {
        next if abs($meetup->lon - int($meetup->lon)) > 0.5;
      } else {
        next if abs($meetup->lon - int($meetup->lon)) <= 0.5;
      }
    }

    if (int($meetup->lon) == int($lon) and int($meetup->lat) != int($lat)) {
      if (abs($offy) > 0.5) {
        next if abs($meetup->lat - int($meetup->lat)) > 0.5;
      } else {
        next if abs($meetup->lat - int($meetup->lat)) <= 0.5;
      }
    }

    if (int($meetup->lon) != int($lon) and int($meetup->lat) != int($lat)) {
      if (abs($offx) > 0.5) {
        next if abs($meetup->lon - int($meetup->lon)) > 0.5;
      } else {
        next if abs($meetup->lon - int($meetup->lon)) <= 0.5;
      }
      if (abs($offy) > 0.5) {
        next if abs($meetup->lat - int($meetup->lat)) > 0.5;
      } else {
        next if abs($meetup->lat - int($meetup->lat)) <= 0.5;
      }
    }
    push @res, { meetupid => $meetup->id, 
                 display  => $id++, 
                 lat      => $meetup->lat,
                 lon      => $meetup->lon, 
                 yes      => $meetup->yes, 
                 no       => $meetup->no,
                 official => 0,
               };
  }

  &result(\@res);
}

sub addMeetup {
  my ($lat, $lon, $date) = @_;

  &error("Missing required parameters!")
    unless defined $lat and defined $lon and $date;

  &verifyDate($date);

  # find other meetup suggestions
  my @logs = $db->resultset('Audit')->search({ip      => $ip,
                                              date    => $date,
                                              action  => 'addMeetup',
                                              revoked => 'no'});
  foreach my $log (@logs) {
    warn "Revoking old meetup ", $log->meetupid, " suggestion on $date\n";
    $log->revoked('yes');
    $log->update;

    my $oldmeet = $db->resultset('Meetup')->find($log->meetupid);
    if ($oldmeet) {
      my ($oldadd) = $db->resultset('Audit')->search({ip       => $ip,
                                                      meetupid => $oldmeet->id,
                                                      action   => 'voteMeetup',
                                                      revoked  => 'no',
                                                      vote     => 'yes'});
      &revoke('yes', $oldmeet, $oldadd);
    }
  }

  # find other yes votes
  my @yesvotes = $db->resultset('Audit')->search({ip      => $ip,
                                                  action  => 'voteMeetup',
                                                  vote    => 'yes',
                                                  revoked => 'no'});
  foreach my $oldvote (@yesvotes) {
    my $oldmeet = $db->resultset('Meetup')->find($oldvote->meetupid);
    next unless $oldmeet and $oldmeet->abslat == int $lat and 
                $oldmeet->abslon == int $lon;
    
    &revoke('yes', $oldmeet, $oldvote);
  }

  my $meetup = $db->resultset('Meetup')->create({ lat    => $lat,
                                                  lon    => $lon,
                                                  abslat => int $lat,
                                                  abslon => int $lon,
                                                  date   => $date,
                                                  yes    => 1 });

  if ($meetup) {
    $db->resultset('Audit')->create({ip       => $ip,
                                     meetupid => $meetup->id,
                                     vote     => 'yes',
                                     action   => 'voteMeetup'});

    $db->resultset('Audit')->create({ip       => $ip,
                                     lat      => $lat,
                                     lon      => $lon,
                                     date     => $date,
                                     meetupid => $meetup->id,
                                     action   => 'addMeetup'});

    &result({id => $meetup->id});
  } else {
    &error("Failed to insert row");
  }
}

sub revoke {
  my ($vote, $meet, $audit, $nodelete) = @_;

  if ($audit) {
    warn "Revoking log ", $audit->id, "\n";
    $audit->revoked('yes');
    $audit->update;
  }

  if ($vote eq 'yes') {
    $meet->yes($meet->yes - 1);
     
    if ($meet->yes == 0 and not $nodelete) {
      warn "Removing empty meetup ", $meet->id, "\n";
      $meet->delete;
    } else {
      $meet->update;
    }
  } else {
    $meet->no($meet->no - 1);
    $meet->update;
  }
}

sub verifyDate {
  my ($date) = @_;

  my ($y, $m, $d) = split /-/, $date, 3;
  my $days = Delta_Days($y, $m, $d, Today());

  if ($days > 7) {
    &error("$date is too far in the past to vote");
  }
}
