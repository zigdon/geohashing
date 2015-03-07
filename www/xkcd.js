// $Id: xkcd.js 466 2009-02-06 22:53:22Z dan $

var map;
var help_toggled   = 0;
var square_visible = 0;
var qsParm         = {};
var lon            = 0;
var lat            = 0;
var zoom           = 8;
var lon_offset     = 0;
var lat_offset     = 0;
var data           = {};
var locations      = {};
var altMarkers     = [];
var suggestion     = {};
var myIcon;
var myMarker;
var myPoint;
var altIcon;
var marker;
var markerPoint;
var cur_poly;
var center_lat;
var center_lon;
var date;
var defaultMsg;
var aprilFools = false;

function $(id){
    return document.getElementById(id);
}

function initialize() {
    var date_box = $('date');
    var date  = new Date();
    var month = date.getMonth() + 1;
    var day   = date.getDate();
    if (month < 10) { month = "0" + month }
    if (day   < 10) { day   = "0" + day   }

    if (month == 4 && day == 1) {
        aprilFools = true;
    }

    qs();

    if (qsParm['abs'] != 1) {
        if (qsParm['long'] == "-0") {
            qsParm['long']=-1;
        } else if (qsParm['long'] < 0) {
            qsParm['long']--;
        }
        if (qsParm['lat'] == "-0") {
            qsParm['lat']=-1;
        } else if (qsParm['lat'] < 0) {
            qsParm['lat']--;
        }
    }

    if (qsParm['date'] == null) {
        date_box.value = date2str(date);
    } else {
        date_box.value = qsParm['date'];
    }

    if (qsParm['zoom'] != null) {
        zoom = parseInt(qsParm['zoom'], 10);
    }

    if (GBrowserIsCompatible()) {
        if (qsParm['embed'] == 1 && qsParm['width'] != null && qsParm['height'] != null) {
            map = new GMap2($("map_canvas"), 
                    { 
                        size: new GSize(qsParm['width'], qsParm['height'])
                    });
        } else {
            map = new GMap2($("map_canvas"));
        }

        if (aprilFools) {
            map.setMapType(G_SKY_VISIBLE_MAP);
        }

        var c;
        c = read_cookie('xkcddefaultlocation');
        if (c == null) {
            center_lat = 42.5;
            center_lon = -71.5;
        } else {
            center_lat = c.split(",")[0];
            center_lon = c.split(",")[1];
        }
        map.addMapType(G_PHYSICAL_MAP);
        map.setCenter(new GLatLng(center_lat, center_lon), zoom);
        if (qsParm['embed'] == 1) {
            $('controls').style.display = $('intro').style.display = 'none';
        } else {
            map.enableDoubleClickZoom();
            map.enableContinuousZoom();
            map.enableScrollWheelZoom();
            map.addControl(new GLargeMapControl(), new GControlPosition(G_ANCHOR_TOP_LEFT   , new GSize(10,30)));
            map.addControl(new GMapTypeControl() , new GControlPosition(G_ANCHOR_TOP_RIGHT  , new GSize(10,30)));
            map.addControl(new GScaleControl()   , new GControlPosition(G_ANCHOR_BOTTOM_LEFT, new GSize(10,30)));
            GEvent.addListener(map, "click", function(overlay,latlng) {
                if(!latlng){ return; }

                lat = Math.floor(latlng.lat());
                lon = Math.floor(latlng.lng());
                show_graticule(lat, lon);
                if (lon_offset != 0 || lat_offset != 0) {
                    update();
                }
                center_map();
            });

            GEvent.addListener(map, "zoomend", function(oldzoom, newzoom) {
                zoom = newzoom;
            });

            //document.getElementById('form').appendChild(map.getContainer().childNodes[6]); // this child doesn't exists
        }
    } else {
        alert("Your browser doesn't seem to be compatible with google maps.");
        document.location="http://wiki.xkcd.com/geohashing/Main_Page";
        return;
    }

    $("status").innerHTML = version();

    if (qsParm['lat'] != null && qsParm['long'] != null) {
        lat = Math.floor(qsParm['lat']);
        lon = Math.floor(qsParm['long']);
        map.setCenter(new GLatLng(lat, lon), zoom);

        show_graticule(lat, lon);
    }


    if (qsParm['embed'] == 1) {
        if (qsParm['date'] != null) {
          update();
        }
        center_map();
        map.disableDoubleClickZoom();
        map.disableContinuousZoom();
        map.disableGoogleBar();
        map.disableScrollWheelZoom();
        map.disableDragging();
    } else {
        update();
        center_map();
    }
}

function qs() {
    var query = window.location.search.substring(1);
    var parms = query.split('&');
    for (var i=0; i<parms.length; i++) {
        var pos = parms[i].indexOf('=');
        if (pos > 0) {
            var key = parms[i].substring(0,pos);
            var val = parms[i].substring(pos+1);
            val = val.replace(/\s+/g, "");
            qsParm[key] = val;
            status.innerHTML += "<br />qs["+key+"] = "+val;
        }
    }
}

function toggle_debug() {
    var debug = $('status');
    debug.style.display = (debug.style.display=='block'?'none':'block');
}

function update() {
    var status  = $('status');
    var message = $('message');

    date = $('date').value.replace(/[^0-9\-]+/g, "");

    status.innerHTML = version();

    if (!date.match(/^\d\d\d\d-\d\d-\d\d$/)) {
        message.innerHTML = "Invalid date.  ";
        date              = '';
        return;
    }

    // use yesterday's date if lon > -30
    var adjdate = null;
    var key     = null;

    if (date >= "2008-05-27" && lon != null && (lon+1) > -30) {
        var d = new Date();
        var datecomp = date.replace(/-0/g, "-").split("-");
        datecomp[0] = parseInt(datecomp[0]);
        datecomp[1] = parseInt(datecomp[1]);
        datecomp[2] = parseInt(datecomp[2]);
        d.setYear(datecomp[0]);
        d.setMonth(datecomp[1]-1, datecomp[2]);
        d.setTime(d.getTime()-24*60*60*1000);
        status.innerHTML += "<br />After 30W adjustment, date is " + date2str(d);
        adjdate = date2str(d);

        if (data[adjdate] == null) {
            status.innerHTML += "<br />Requesting market open for " + adjdate;
            ajax_get_djia(adjdate);
            return;
        } else {
            status.innerHTML += "<br />Market open on " + adjdate + " = " + data[adjdate];
        }

        data[adjdate] = twodec(data[adjdate]);
        key = date+"-"+data[adjdate];
    } else {
        if (data[date] == null) {
            status.innerHTML += "<br />Requesting market open for " + date;
            ajax_get_djia(date);
            return;
        } else {
            status.innerHTML += "<br />Market open on " + date + " = " + data[date];
        }

        data[date] = twodec(data[date]);
        key = date+"-"+data[date];
    }


    status.innerHTML += "<br />MD5(" + key + "): ";
    var md5 = MD5(key);
    status.innerHTML += md5;

    status.innerHTML += "<br />Split: " + md5.substr(0,16) + ", " + md5.substr(16,16);
    lon_offset = 0;
    lat_offset = 0;
    for (var i=1; i<= 16; i++) {
        lat_offset += parseInt(md5.substr(16-i, 1), 16);
        lon_offset += parseInt(md5.substr(32-i, 1), 16);
        lat_offset /= 16;
        lon_offset /= 16;
    }

    status.innerHTML += "<br /> offset = " + lat_offset + ", " + lon_offset;

    if (lat >= 0) {
        tar_lat = lat + lat_offset;
    } else {
        tar_lat = lat - lat_offset + 1;
    }
    if (lon >= 0) {
        tar_lon = lon + lon_offset;
    } else {
        tar_lon = lon - lon_offset + 1;
    }
    status.innerHTML += "<br />" + tar_lat + " " + tar_lon;

    if (square_visible == 1) {
        if (marker) {
            map.removeOverlay(marker);
        }

        if (qsParm['embed'] == 1) {
          marker = new GMarker(markerPoint=new GLatLng(tar_lat, tar_lon));
        } else {
          marker = new GMarker(markerPoint=new GLatLng(tar_lat, tar_lon), {draggable:true});
          defaultMsg = 'Default XKCD Meetup Location<br />for ' + date + '.<br/>' +
                       'Will you be there? <button id="voteyes" class="votebuttons" ' +
                       'onclick="voteDefaultLocation(\'' + date + '\', ' + lat + ', ' + lon + 
                       ', \'yes\');">Yes</button><button id="voteno" class="votebuttons" ' +
                       'onclick="voteDefaultLocation(\'' + date + '\', ' + lat + ', ' + lon + 
                       ', \'no\');">No</button>';
          GEvent.addListener(marker, 'click', function(){
              marker.openInfoWindowHtml(defaultMsg);
          });

          GEvent.addListener(marker, 'dragend', dragEnd.bind(marker, markerPoint));
        }

        map.addOverlay(marker);

        getLocations();

        center_lat = tar_lat;
        center_lon = tar_lon;

        message.innerHTML = "Meetup location:<br />* " +
        "<span class=\"coords\">" + accuracy(tar_lat, 6) + "&deg;</span>, " +
        "<span class=\"coords\">" + accuracy(tar_lon, 6) + "&deg;</span>";

        var link = $('self');
        link.href="map.html?date=" + date  + "&lat=" + lat + "&long=" + lon + "&zoom=" + zoom + "&abs=1";

        ns = "N";
        ew = "E";
        var abslat, abslon;
        abslat = lat; abslon = lon;
        if (lat < 0) { abslat++; abslat*=-1; ns="S"; }
        if (lon < 0) { abslon++; abslon*=-1; ew="W"; }
        var lam, las, lom, los;
        lam = lat_offset * 60;
        lom = lon_offset * 60;
        message.innerHTML += " or<br />* " +
        "<span class=\"coords\">" + ns + abslat + "&deg;" + accuracy(lam, 4) + "'</span>, " +
        "<span class=\"coords\">" + ew + abslon + "&deg;" + accuracy(lom, 4) + "'</span>";
        lam = Math.floor(lam);
        lom = Math.floor(lom);
        las = (lat_offset * 60 - lam) * 60;
        los = (lon_offset * 60 - lom) * 60;
        message.innerHTML += " or<br />* " +
        "<span class=\"coords\">" + ns + abslat + "&deg;" + lam + "'" + accuracy(las, 2) + '"</span>, ' +
        "<span class=\"coords\">" + ew + abslon + "&deg;" + lom + "'" + accuracy(los, 2) + '"</span>';

        if (adjdate != null) {
            message.innerHTML += "<br />DJIA adjusted for location east<br/>of the 30W longitude";
        }


        $('maplink').href = "http://maps.google.com/?ie=UTF8&ll=" +
                             tar_lat + "," + tar_lon + "&z=" + zoom +
                             "&q=loc:" + tar_lat + "," + tar_lon;
        $('foodlink').href = "http://local.google.com/maps?" +
                             "f=l&hl=en&geocode=&time=&date=&ttype=&q=category:Restaurants&near=" +
                             tar_lat + ",+" + tar_lon +
                             "&ie=UTF8&z=13&om=0";
        $('links').style.display='inline';
    } else {
        message.innerHTML = "Select a region on the map";
    }

    update_links(lat, lon, date);
}

function accuracy(n, places) {
    n *= Math.pow(10, places);
    n = Math.floor(n);
    return n /= Math.pow(10, places);
}

function ajax_get_djia(date) {
    var xhr = get_xhr();
    if(!xhr){ return; }

    xhr.onreadystatechange  = function() {
        if(xhr.readyState !=4){ return; }

        // status.innerHTML += "<br /> AJAX status == " + xhr.status;
        if(xhr.status == 200) {
            data[date] = xhr.responseText;
            update();
            center_map();
        } else {
            if (marker) {
                map.removeOverlay(marker);
                $('links').style.display='none';
            }
            $('message').innerHTML = "Market data is not available for " + date;
        }
    };

    path = date.replace(/-/g, "/");
    status.innerHTML += "<br /> AJAX GET /xkcd/map/data/" + path;
    xhr.open('GET', "/xkcd/map/data/"+path, true);
    xhr.send('');


}

function get_xhr(){
    try { return new XMLHttpRequest();                   }catch(e){}
    try { return new ActiveXObject('Msxml2.XMLHTTP'   ); }catch(e){}
    try { return new ActiveXObject('Microsoft.XMLHTTP'); }catch(e){}

    return false;
}

function ajax_get_loc(key) {
    var xhr = get_xhr();
    if(!xhr){ return; }

    if (aprilFools) {
        xhr.onreadystatechange  = function() {
            if(xhr.readyState!=4 || xhr.status!=200){ return; }

            constList = xhr.responseText.split("\n");
            locations[key] = constList[Math.floor(Math.random()*(constList.length-1))].split("!");
            center_map();
        };

        xhr.open('GET', "/xkcd/map/data/loc/const.txt", true);
        xhr.send('');
    } else {
        xhr.onreadystatechange  = function() {
            if(xhr.readyState!=4 || xhr.status!=200){ return; }

            locations[key] = xhr.responseText.split("!");
            center_map();
        };

        status.innerHTML += "<br /> AJAX GET /xkcd/map/data/loc/" + key;
        xhr.open('GET', "/xkcd/map/data/loc/" + key, true);
        xhr.send('');
    }
}

function show_graticule(lat, lon) {
    if (cur_poly != null) {
        map.removeOverlay(cur_poly);
    }
    var polygon = new GPolygon([
        new GLatLng(lat    , lon),
        new GLatLng(lat + 1, lon),
        new GLatLng(lat + 1, lon + 1),
        new GLatLng(lat    , lon + 1),
        new GLatLng(lat    , lon)
    ], "#f33f00", 1, 1, "#ffe0e0", 0.2, {geodesic:true});
    map.addOverlay(polygon);
    cur_poly       = polygon;
    square_visible = 1;
    center_lat     = lat + 0.5;
    center_lon     = lon + 0.5;
}

function twodec(n) {
    // make sure we are showing 2 decimal places
    var s = new String(n);
    if (! s.match(/\.\d\d$/)) {
        if (n == Math.floor(n)) {
            n += ".00";
        } else if (n * 10 == Math.floor(n * 10)) {
            n += "0";
        }
    }

    return n;
}

function center_map() {
    if (center_lat == null || center_lon == null) {
        return;
    }

    map.setCenter(new GLatLng(center_lat, center_lon));

    update_links(center_lat, center_lon, null);
}

function update_links(lat, lon, date) {
    $('graticule').style.display='inline';

    var glat = lat; var glon = lon;
    if (glat < 0) {
        glat = Math.floor(glat) + 1;
        if (glat == 0) { glat = "-0" }
    } else {
        glat = Math.floor(glat);
    }
    if (glon < 0) {
        glon = Math.floor(glon) + 1;
        if (glon == 0) { glon = "-0" }
    } else {
        glon = Math.floor(glon);
    }

    if (date != null) {
        $('wikidatelink').href = "http://wiki.xkcd.com/geohashing/" + date;
        $('wikidate').style.display='inline';
        if (glat != null) {
            $('wikigratlink').href = "http://wiki.xkcd.com/geohashing/" + date +
            "_" + glat + "_" + glon;
            $('wikigratdate').style.display='inline';
        }
    }

    var gkey = glat + "," + glon;
    $('gratlat').innerHTML      = glat;
    $('gratlon').innerHTML      = glon;
    if (locations[gkey] != null) {
        $('wikigratname').innerHTML = locations[gkey][0];
        if (aprilFools) {
            $('wikigratname').href = locations[gkey][1];
        } else {
            $('wikigratname').href = "http://wiki.xkcd.com" + locations[gkey][1];
        }
        $('wikigrat').style.display='inline';
        $('gratname').innerHTML     = locations[gkey][0];
    } else {
        $('gratname').innerHTML     = "Unknown";
        $('wikigrat').style.display ='none';
        $('wikigratname').innerHTML = "Unknown";
        ajax_get_loc(gkey);
    }

}

function make_default() {
    var center = map.getCenter();
    if (center == null || center.lat() == null || center.lng() == null) return;

    write_cookie('xkcddefaultlocation', center.lat() + ',' + center.lng());

    $('saved').innerHTML = "Location saved";
}

function read_cookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function write_cookie(name, val){
    var d = new Date();
    d.setYear(d.getFullYear()+1);
    document.cookie = name + '=' + val + '; expires=' + d.toGMTString() + '; path=/';
}


function date2str(date) {
    return (date.getFullYear() + "-" + (1+date.getMonth()) + "-" + date.getDate())
        .replace(/-(\d)-/, "-0$1-")
        .replace(/-(\d)$/, "-0$1");
}

function getLocations(){
    var lat = markerPoint.lat();
    var lon = markerPoint.lng();

    var xhr = get_xhr();
    if(!xhr){ return; }

    if(myMarker){ map.removeOverlay(myMarker); }

    for(var i=0; i<altMarkers.length; i++){
        map.removeOverlay(altMarkers[i]);
    }
    altMarkers = [];

    var url = '/cgi-bin/geovote.cgi?action=getMeetups&lat='+lat+'&lon='+lon+'&date='+date+'&dist=1';

    xhr.onreadystatechange  = function() {
        if(xhr.readyState !=4){ return; }

        if(xhr.status == 200){
            var ret = eval('('+xhr.responseText+')');
            if (ret.err) {
              $('status').innerHTML += "<br/>Error (getLocations): " + ret.err;
            } else if (ret != null) {
              drawAltLocations(ret);
            } else {
              $('status').innerHTML += "<br/>Error (getLocations): null result";
            }
        }
    };

    xhr.open('GET', url, true);
    xhr.send(null);
}

function dragEnd(markerPoint){
    myPoint = this.getPoint();
    this.setPoint(markerPoint);

    if(myMarker){
        map.removeOverlay(myMarker);
    }

    if(!myIcon){ myIcon = new GIcon(G_DEFAULT_ICON, '/xkcd/map/green-dot.png'); }
    myMarker = new GMarker(myPoint, {draggable:true, icon:myIcon});

    GEvent.addListener(myMarker, 'click', function(){
        myMarker.openInfoWindowHtml('<button onclick="submitMyLocation();">Submit This Location</button>');
    });

    map.addOverlay(myMarker);
}

function drawAltLocations(locations){
    var modlat, modlon;
    modlat = lat; modlon = lon;
    if (lat < 0) { modlat++; }
    if (lon < 0) { modlon++; }

    var def;
    if (locations[0].official == 1) {
      def = locations.shift();
      defaultMsg = 'Default XKCD Meetup Location<br />for ' + date + '.<br/>' +
                   ( def.yes == 1 ? "1 person said they'll be there.<br />" :
                                    def.yes + " people said they'll be there.<br/>" ) +
                   ( def.no == 1  ? "1 person said they won't be there.<br />" :
                                    def.no + " people said they won't be there.<br/><br/>" ) +
                   'Will you be there? <button id="voteyes" class="votebuttons" ' +
                   'onclick="voteDefaultLocation(\'' + date + '\', ' + modlat + ', ' + modlon + 
                   ', \'yes\');">Yes</button><button id="voteno" class="votebuttons" ' +
                   'onclick="voteDefaultLocation(\'' + date + '\', ' + modlat + ', ' + modlon + 
                   ', \'no\');">No</button>';
      $('status').innerHTML += "<br/>official location votes: " + def.yes + "/" + def.no;
    } else {
      defaultMsg = 'Default XKCD Meetup Location<br />for ' + date + '.<br/>' +
                   'Will you be there? <button id="voteyes" class="votebuttons" ' +
                   'onclick="voteDefaultLocation(\'' + date + '\', ' + modlat + ', ' + modlon + 
                   ', \'yes\');">Yes</button><button id="voteno" class="votebuttons" ' +
                   'onclick="voteDefaultLocation(\'' + date + '\', ' + modlat + ', ' + modlon + 
                   ', \'no\');">No</button>';
      $('status').innerHTML += "<br/>official location votes: none yet.";
    }

    if (locations.length == 0) {
      $('alternates').innerHTML = "";
      return;
    }

    altMarkers = [];
    if (qsParm['embed'] != 1) {
      $('alternates').innerHTML = "<strong>Location voting:</strong><br />";
      var ul = document.createElement('ul');
      ul.id = "alternates_ul";
      $('alternates').appendChild(ul);

      var li = document.createElement('li');
      li.innerHTML += "Official location: " +
                      def.yes + " yes vote" + (def.yes == 1 ? "" : "s") + "; " +
                      def.no  + " no vote" + (def.no == 1 ? "" : "s") + "; ";
      $('alternates_ul').appendChild(li);

      $('alternates').innerHTML += "<strong>Suggested alternate locations:</strong><br />";
      var ol = document.createElement('ol');
      ol.id = "alternates_ol";
      $('alternates').appendChild(ol);
    }

    for(var i=0; i<locations.length; i++) {
        drawAltLocation(locations[i]);
    }
}

function drawAltLocation(loc){
    if(parseInt(loc.yes)<=0){ return; }
    if(!altIcon){ altIcon = new GIcon(G_DEFAULT_ICON, '/xkcd/map/blue-dot.png'); }

    var thisPoint, marker;
    if (qsParm['embed'] == 1) {
      thisPoint, marker = new GMarker(thisPoint=new GLatLng(loc.lat, loc.lon), {icon:altIcon});
    } else {
      thisPoint, marker = new GMarker(thisPoint=new GLatLng(loc.lat, loc.lon), {draggable:true, icon:altIcon});

      GEvent.addListener(marker, 'dragend', dragEnd  .bind(marker, thisPoint));
      GEvent.addListener(marker, 'click'  , votePopup.bind(marker, loc, thisPoint));

      var li = document.createElement('li');
      var dist = Math.floor(thisPoint.distanceFrom(markerPoint));
      if (dist >= 1000) {
        dist /= 10;
        dist = Math.floor(dist);
        dist /= 100;
        dist += "km";
      } else {
        dist = Math.floor(dist);
        dist += "m";
      }
      li.innerHTML += "<a href=\"#\" onclick=\"return false;\">" +
                      loc.lat + ", " + loc.lon + "</a> (" + dist + " away): " +
                      loc.yes + " yes vote" + (loc.yes == 1 ? "" : "s") + "; " +
                      loc.no  + " no vote" + (loc.no == 1 ? "" : "s") + "; ";
      li.onclick = votePopup.bind(marker, loc, thisPoint);
      $('alternates_ol').appendChild(li);
    }
    altMarkers.push(marker);

    map.addOverlay(marker);
}

function votePopup(loc, point){
    var dist = point.distanceFrom(markerPoint);
    if (dist >= 1000) {
      dist /= 10;
      dist = Math.floor(dist);
      dist /= 100;
      dist += "km";
    } else {
      dist = Math.floor(dist);
      dist += "m";
    }
    this.openInfoWindowHtml('<a href="http://maps.google.com/?ie=UTF8&ll=' +
                            loc.lat + ',' + loc.lon + '&z=12&q=loc:' +
                            loc.lat + ',' + loc.lon + '">' + 
                            loc.lat + ', ' + loc.lon + '</a><br />This point (#' +
                            loc.display + ') is ' + dist + ' from the default location<br /><br />' + 
                            ( loc.yes == 1 ? "1 person said they'll be there.<br />" :
                                            loc.yes + " people said they'll be there.<br/>" ) +
                            ( loc.no == 1  ? "1 person said they won't be there.<br />" :
                                            loc.no + " people said they won't be there.<br/><br/>" ) +
                            'Will you there? <button id="voteyes" class="votebuttons" ' +
                            'onclick="voteLocation(' + loc.meetupid + ', \'yes\');">' + 
                            'Yes</button><button id="voteno" class="votebuttons" ' +
                            'onclick="voteLocation(' + loc.meetupid + 
                            ', \'no\');">No</button>');
}

function addLocation(lat, lon, date){
    var xhr = get_xhr();
    if(!xhr){ return; }

    var url = '/cgi-bin/geovote.cgi?action=addMeetup&lat='+lat+'&lon='+lon+'&date='+date;

    xhr.onreadystatechange  = function() {
        if(xhr.readyState !=4){ return; }

        if(xhr.status == 200) {
            var ret = eval('('+xhr.responseText+')');
            if (ret.err) {
              $('status').innerHTML += "<br/>Error (addLocation): " + ret.err;
            } else {
              getLocations(lat, lon, date);
            }
        }
    };

    xhr.open('GET', url, true);
    xhr.send(null);
}

function voteDefaultLocation(date, lat, lon, vote){
    var xhr = get_xhr();

    var xhr = get_xhr();
    var url = '/cgi-bin/geovote.cgi?action=voteDefaultMeetup&date='+date+'&lat='+lat+'&lon='+lon+'&vote='+vote;

    xhr.onreadystatechange  = function() {
        if(xhr.readyState !=4){ return; }

        if(xhr.status == 200){
            var ret = eval('('+xhr.responseText+')');
            if (ret.err) {
              $('status').innerHTML += "<br/>Error (voteDefaultLocation): " + ret.err;
            }
        }

        getLocations();
    };

    xhr.open('GET', url, true);
    xhr.send(null);

    map.closeInfoWindow();
}

function voteLocation(locID, vote){
    var xhr = get_xhr();

    var xhr = get_xhr();
    var url = '/cgi-bin/geovote.cgi?action=voteMeetup&meetupid='+locID+'&vote='+vote;

    xhr.onreadystatechange  = function() {
        if(xhr.readyState !=4){ return; }

        if(xhr.status == 200){
            var ret = eval('('+xhr.responseText+')');
            if (ret.err) {
              $('status').innerHTML += "<br/>Error (voteLocation): " + ret.err;
            }
        }

        getLocations();
    };

    xhr.open('GET', url, true);
    xhr.send(null);

    map.closeInfoWindow();
}

function submitMyLocation(){
    var latlng = myMarker.getLatLng();

    addLocation(latlng.lat(), latlng.lng(), date);
}

Array.copy = function(a){
    var n=[];
    for(var i=a.length-1; i>=0; i--){
        n[i]=a[i];
    }
    return n;
}

Function.prototype.bind = function(){
    var _this = this, args = Array.copy(arguments), obj = args.shift();
    return function(){ return _this.apply(obj, args.concat(Array.copy(arguments))); }
}

function version() {
    return "xkcd.js version $Id: xkcd.js 466 2009-02-06 22:53:22Z dan $";
}

function toggleSuggest() {
    if (help_toggled) {
      help_toggled = 0;
      $('suggesthelp').style.display = "block";
      $('suggest').style.display     = "none";
    } else {
      help_toggled = 1;
      $('suggesthelp').style.display = "none";
      $('suggest').style.display     = "block";
    }
}
