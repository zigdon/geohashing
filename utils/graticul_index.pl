#!/usr/bin/perl 
#
# $Id: graticul_index.pl 681 2009-07-29 23:28:14Z dan $

use strict;
use LWP::Simple;
use File::Copy;
use HTML::TreeBuilder;
use HTML::Entities qw/encode_entities_numeric/;

print scalar localtime, " Starting...\n";

my @known_ok = (
  'N/A', 'edit', 'page', 'Graticule', 'Achievement',
);

my @regions = qw/Africa Antarctica Australasia Eurasia North_America Oceans South_America/;

my $dir = "/var/www/xkcd/map/data/loc";
my $kml = "/var/www/xkcd/map/data/graticule.kml";
mkdir $dir, 0775 or die "Can't mkdir $dir: $!" unless -d $dir;

open(KML, ">$kml.new") or die "Can't write $kml.new: $!";
binmode KML, ':utf8';
print KML <<KML;
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://earth.google.com/kml/2.2">
<Document>
KML

print KML "<Style id=\"users_0\"><PolyStyle><color>20800000</color><colorMode>normal</colorMode></PolyStyle></Style>\n";
my $max_users = 100;
my $color_inc = int(256/$max_users);
foreach (1..$max_users) {
  print KML "<Style id=\"users_$_\">";
  printf KML "<PolyStyle><color>3000%02x00</color><colorMode>random</colorMode></PolyStyle>", $color_inc * $_;
  printf KML "<LineStyle><color>a000%02x00</color><width>1</width></LineStyle>", $color_inc * $_;
  print KML "</Style>\n";
}

print scalar localtime, " KML header done\n";

foreach my $region (@regions) {
  print scalar localtime, " Reading $region\n";
  my $URL = "http://wiki.xkcd.com/geohashing/All_Graticules/$region";

  my $page = get($URL) or die "Can't download $URL: $!";
  my $tree = HTML::TreeBuilder->new_from_content($page);

  my %seen;
  my @links = $tree->look_down(_tag => 'a');
  foreach my $link (@links) {
    my $url = $link->attr('href');
    my $title = $link->attr('title');
    my $text = $link->as_text || "N/A";
    $text =~ s/^\s+|\s+$//g;
    unless ($text =~ /(-?\d+), ?(-?\d+)/) {
      $url ||= "N/A";
      next if $url =~ /[:#?]/;
      my $skip = 0;
      foreach (@known_ok) {
        if (not ref $_ and lc $text eq lc $_) {
          $skip = 1;
          last;
        } elsif ($text =~ /$_/i) {
          $skip = 1;
          last;
        }
      }
      print "Possible bad link: $text ($url)\n" unless $skip;
      next;
    }
    my ($lat, $lon) = ($1, $2);

    if (exists $seen{"$lat,$lon"}) {
      print "Duplicate graticule at $lat, $lon: $title / ", $seen{"$lat,$lon"}, "\n";
      next;
    }
    $seen{"$lat,$lon"} = $title;

    # get each page, count how many users are mentioned on it
    my $users = 0;
    my $gpage = get("http://wiki.xkcd.com$url");
    if ($gpage and my $gtree = HTML::TreeBuilder->new_from_content($gpage)) {
      my @ulinks = $gtree->look_down(_tag => 'a', 
                                     sub { $_[0]->attr('href') and 
                                           $_[0]->attr('href') =~ /User:/ });
      my %users_seen;
      foreach my $user (@ulinks) {
        $users_seen{$user->attr('href')}++;
      }
      $users = keys %users_seen;
      $gtree->delete;
    }

    # print "$title: $lat, $lon ($url)\n";

    open(LOC, ">$dir/$lat,$lon") or die "Can't write $dir/$lat,$lon: $!";
    binmode LOC, ':utf8';
    my ($latdir, $londir) = (1, 1);
    $latdir = -1 if $lat < 0;
    $londir = -1 if $lon < 0;

    print LOC "$title!$url";
    close LOC;
    print KML "<Placemark>";
    print KML "<styleUrl>#users_$users</styleUrl>";
    print KML "<name>", &encode_entities_numeric($title), "</name>";
    print KML "<description>$lat, $lon, $users users, ",
              "<![CDATA[<a href=\"http://wiki.xkcd.com$url\">wiki</a>]]>",
              "</description>";
    print KML "<Polygon>";
    print KML "<extrude>0</extrude>";
    print KML "<outerBoundaryIs><LinearRing><coordinates>\n";

    if ($lat eq '-0') { $lat = -1 };
    if ($lon eq '-0') { $lon = -1 };

    print KML join(",", $lon,           $lat), "\n";
    print KML join(",", $lon + $londir, $lat), "\n";
    print KML join(",", $lon + $londir, $lat + $latdir), "\n";
    print KML join(",", $lon,           $lat + $latdir), "\n";
    print KML join(",", $lon,           $lat), "\n";
    print KML "</coordinates></LinearRing></outerBoundaryIs>";
    print KML "</Polygon></Placemark>\n";
  }
  $tree = $tree->delete;
  print scalar localtime, " End of links\n";
}

print KML <<KML;
</Document></kml>
KML
close KML;

move "$kml.new", $kml or die "Can't rename $kml: $!";

# cleanup old files
opendir(DIR, $dir) or die "Can't opendir $dir: $!";
foreach my $file (grep /,/, readdir(DIR)) {
  next if -M "$dir/$file" < 0.25;  # skip files newer than 6 hours
  print "Removing $dir/$file\n";
  unlink "$dir/$file" or die "Can't remove $dir/$file: $!";
}
closedir(DIR);

print scalar localtime, " Done\n";

__END__
irc$ GET http://wiki.xkcd.com/geohashing/Active_Graticules | grep China
</p><p><a href="/geohashing/Nanning%2C_China" title="Nanning, China">22, 108 (Nanning, China)</a>
</p><p><a href="/geohashing/Beijing%2C_China" title="Beijing, China">39, 116 (Beijing, China)</a>
</p><p><a href="/geohashing/San_Francisco" class="mw-redirect" title="San Francisco">37, -122 (San Francisco, California)</a>
</p><p><a href="/geohashing/San_Francisco:_East_Bay" class="mw-redirect" title="San Francisco: East Bay">37, -121 (San Francisco: East Bay, San Jose, California)</a>

