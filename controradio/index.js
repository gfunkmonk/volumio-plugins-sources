'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new (require('v-conf'))();
var NanoTimer = require('nanotimer');
const http = require('http');
var moment = require('moment');
var Parser = require('rss-parser');
var parser = new Parser();
var unirest = require('unirest');

var apiUrl;
var timeOffset = 32000;
var currentChannel;
var currentChannelCover;

module.exports = Controradio;

function Controradio(context) {
    var self = this;

    self.context = context;
    self.commandRouter = this.context.coreCommand;
    self.logger = this.context.logger;
    self.configManager = this.context.configManager;

    self.state = {};
    self.timer = null;
};

Controradio.prototype.onVolumioStart = function () {
    var self = this;
    self.configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
	self.getConf(self.configFile);

    self.apiDelay = self.config.get('apiDelay');
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] API delay: ' + self.apiDelay);
    if(self.apiDelay) {
        timeOffset = self.apiDelay * 1000;
    }

    return libQ.resolve();
};

Controradio.prototype.getConfigurationFiles = function () {
    return ['config.json'];
};

Controradio.prototype.onStart = function () {
    var self = this;

    self.mpdPlugin = this.commandRouter.pluginManager.getPlugin('music_service', 'mpd');

    self.loadRadioI18nStrings();
    self.addRadioResource();
    self.addToBrowseSources();

    self.serviceName = "80s80s";

    // Once the Plugin has successfull started resolve the promise
    return libQ.resolve();
};

Controradio.prototype.onStop = function () {
    return libQ.resolve();
};

Controradio.prototype.onRestart = function () {
    var self = this;
    // Optional, use if you need it
    return libQ.resolve();
};


// Configuration Methods -----------------------------------------------------------------------------
Controradio.prototype.getUIConfig = function () {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.getConf(this.configFile);
    self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
        __dirname + '/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function (uiconf) {
            uiconf.sections[0].content[0].value = self.config.get('apiDelay');
            defer.resolve(uiconf);
        })
        .fail(function () {
            defer.reject(new Error());
        });

    return defer.promise;
};


Controradio.prototype.setUIConfig = function (data) {
    var self = this;
    var uiconf = fs.readJsonSync(__dirname + '/UIConfig.json');

    return libQ.resolve();
};

Controradio.prototype.getConf = function (configFile) {
    var self = this;

    self.config = new (require('v-conf'))();
    self.config.loadFile(configFile);
};

Controradio.prototype.setConf = function(conf) {
    var self = this;
  
    fs.writeJsonSync(self.configFile, JSON.stringify(conf));
};

Controradio.prototype.updateConfig = function (data) {
    var self = this;
    var defer = libQ.defer();
    var configUpdated = false;
  
    if (self.config.get('apiDelay') != data['apiDelay']) {
      self.config.set('apiDelay', data['apiDelay']);
      self.apiDelay = data['apiDelay'];
      configUpdated = true;
    }
  
    if(configUpdated) {
      var responseData = {
        title: self.getRadioI18nString('PLUGIN_NAME'),
        message: self.getRadioI18nString('SAVE_CONFIG_MESSAGE'),
        size: 'md',
        buttons: [{
          name: 'Close',
          class: 'btn btn-info'
        }]
      };
  
      self.commandRouter.broadcastMessage("openModal", responseData);
    }
  
    return defer.promise;
  };

// Playback Controls ---------------------------------------------------------------------------------------
Controradio.prototype.addToBrowseSources = function () {
    // Use this function to add your music service plugin to music sources
    var self = this;

    self.commandRouter.volumioAddToBrowseSources({
        name: 'ControRadio',
        uri: 'controradio',
        plugin_type: 'music_service',
        plugin_name: "controradio",
        albumart: '/albumart?sourceicon=music_service/controradio/images/Controradio.png'
    });
};

Controradio.prototype.handleBrowseUri = function (curUri) {
    var self = this;
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] handleBrowseUri curUri: ' + curUri);
    console.log(curUri)
    if (curUri === 'controradio') {
        response = self.getRootContent();
    }
};

Controradio.prototype.getRootContent = function() {
    var self=this;
    var response;
    var defer = libQ.defer();

    const serviceName = "YourServiceName"; // Replace with your actual service name
    const rssUrl = 'https://ondemand.controradio.it/rss/Home.xml';
    var response = self.rootNavigation;

    unirest.get(rssUrl)
        .end(response => {
            if (response.error) {
                console.error('Error fetching RSS:', response.error);
                defer.reject('Fail getting RSS')
            }
            console.log(JSON.stringify(response.body));
            parser.parseString(response.body)
                .then(feed => {
                    const formattedItems = feed.items.map(item => ({
                        service: serviceName,
                        type: 'folder',
                        title: item.title,
                        icon: 'fa fa-folder-open-o',
                        uri: item.link
                    }));
                    response.navigation.lists[0].items = formattedItems;
                    console.log(JSON.stringify(formattedItems));
                    defer.resolve(response);
                })
                .catch(error => {
                    console.error('Error parsing RSS:', error);
                });
        });

  /*
    response = self.rootNavigation;
    response.navigation.lists[0].items = [];
    for (var key in self.rootStations) {
        var radio = {
          service: self.serviceName,
          type: 'folder',
          title: self.rootStations[key].title,
          icon: 'fa fa-folder-open-o',
          uri: self.rootStations[key].uri
        };
        response.navigation.lists[0].items.push(radio);
    }

    */


    return defer.promise;
};

Controradio.prototype.getRadioContent = function (station) {
    var self = this;
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] getRadioContent url: ' + station);
    var response;
    var defer = libQ.defer();

    //var radioStation = self.radioStations.eighties;
    var radioStation;
    switch (station) {
        case 'eighties':
            radioStation = self.radioStations.eighties;
            break;
        case 'nineties':
            radioStation = self.radioStations.nineties;
    }

    response = self.radioNavigation;
    response.navigation.lists[0].items = [];
    for (var i in radioStation) {
        var channel = {
            service: self.serviceName,
            type: 'mywebradio',
            title: radioStation[i].title,
            artist: '',
            album: '',
            icon: 'fa fa-music',
            uri: radioStation[i].uri
        };
        response.navigation.lists[0].items.push(channel);
    }
    defer.resolve(response);

    return defer.promise;
};

// Define a method to clear, add, and play an array of tracks
Controradio.prototype.clearAddPlayTrack = function (track) {
    var self = this;
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] clearAddPlayTrack url: ' + track.uri);
    if (self.timer) {
        self.timer.clear();
    }
    var found;
    var radioStation = self.radioStations.eighties;
    for (var i in radioStation) {
        var channel = radioStation[i];
        if(channel.url == track.uri) {
            currentChannel = channel.title;
            apiUrl = channel.api;
            currentChannelCover = channel.cover;
            found = "true";
            break;
        }
    }

    if(!found) {
        var radioStation = self.radioStations.nineties;
        for (var i in radioStation) {
            var channel = radioStation[i];
            if(channel.url == track.uri) {
                currentChannel = channel.title;
                apiUrl = channel.api;
                currentChannelCover = channel.cover;
                found = "true";
                break;
            }
        }
    }

    var songs;
    return self.setSongs(apiUrl + '&count=2')
        .then(function (result) {
            songs = result;
        })
        .then(function() {
            return self.mpdPlugin.sendMpdCommand('stop', []);
        })
        .then(function () {
            return self.mpdPlugin.sendMpdCommand('clear', []);
        })
        .then(function () {
            return self.mpdPlugin.sendMpdCommand('consume 1', []);
        })
        .then(function () {
            self.logger.info('[' + Date.now() + '] ' + '[80s80s] adding url: ' + track.uri);
            return self.mpdPlugin.sendMpdCommand('add "' + track.uri + '"', []);
        })
        .then(function () {
            self.commandRouter.pushToastMessage('info',
                self.getRadioI18nString('PLUGIN_NAME'),
                self.getRadioI18nString('WAIT_FOR_RADIO_CHANNEL'));

            return self.mpdPlugin.sendMpdCommand('play', []);
        })
        .then(function () {
            return self.playNextTrack(songs);
        })
        .fail(function (e) {
            return libQ.reject(new Error());
        });
};

Controradio.prototype.seek = function (position) {
    var self = this;
    this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + '[80s80s] seek to ' + position);
    return libQ.resolve();
};

// Stop
Controradio.prototype.stop = function () {
    var self = this;
    if (self.timer) {
        self.timer.clear();
    }
    self.commandRouter.pushToastMessage(
        'info',
        self.getRadioI18nString('PLUGIN_NAME'),
        self.getRadioI18nString('STOP_RADIO_CHANNEL')
    );

    return self.mpdPlugin.stop()
        .then(function () {
            self.state.status = 'stop';
            self.commandRouter.servicePushState(self.state, self.serviceName);
        });
};

// Pause
Controradio.prototype.pause = function () {
    var self = this;

    // pause the timeout of this song
    if (self.timer) {
        self.timer.pause();
    }

    // pause the song and store the seek position needed for the new setTimeout calculation
    return self.mpdPlugin.sendMpdCommand('pause', [1])
    .then(function () {
        var vState = self.commandRouter.stateMachine.getState();
        self.state.status = 'pause';
        self.state.seek = vState.seek;
        self.commandRouter.servicePushState(self.state, self.serviceName);
    });
};

// Resume
Controradio.prototype.resume = function () {
    var self = this;

    // seek back 1 sec to prevent mpd crashing on resume of a paused stream
    var fixMpdCrashCmds = [
        { command: 'seekcur', parameters: ['-1'] },
        { command: 'play', parameters: [] }
    ];

    return self.mpdPlugin.sendMpdCommandArray(fixMpdCrashCmds)
    .then(function () {
        // setTimeout
        if (self.timer) {
            self.timer.resume();
        }

        // adapt play status and update state machine
        self.state.status = 'play';
        self.commandRouter.servicePushState(self.state, self.serviceName);
    });
};

Controradio.prototype.explodeUri = function (uri) {
    var self = this;
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] explodeUri: ' + uri);
    var defer = libQ.defer();
    var response = [];

    var uris = uri.split("/");
    var channel = parseInt(uris[1]);
    var query;
    var station;

    station = uris[0].substring(3);

    switch (uris[0]) {
        case 'webeighties':
            if (self.timer) {
                self.timer.clear();
            }
            response.push({
                service: self.serviceName,
                type: 'track',
                trackType: self.getRadioI18nString('PLUGIN_NAME'),
                radioType: station,
                albumart: self.radioStations.eighties[channel].cover,
                uri: self.radioStations.eighties[channel].url,
                name: self.radioStations.eighties[channel].title,
                duration: 1000
            });
            defer.resolve(response);
            break;
        case 'webnineties':
            if (self.timer) {
                self.timer.clear();
            }
            response.push({
                service: self.serviceName,
                type: 'track',
                trackType: self.getRadioI18nString('PLUGIN_NAME'),
                radioType: station,
                albumart: self.radioStations.nineties[channel].cover,
                uri: self.radioStations.nineties[channel].url,
                name: self.radioStations.nineties[channel].title,
                duration: 1000
            });
            defer.resolve(response);
            break;
        default:
            defer.resolve();
    }
    return defer.promise;
};

Controradio.prototype.getAlbumArt = function (data, path) {

    var artist, album;

    if (data != undefined && data.path != undefined) {
        path = data.path;
    }

    var web;

    if (data != undefined && data.artist != undefined) {
        artist = data.artist;
        if (data.album != undefined)
            album = data.album;
        else album = data.artist;

        web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
    }

    var url = '/albumart';

    if (web != undefined)
        url = url + web;

    if (web != undefined && path != undefined)
        url = url + '&';
    else if (path != undefined)
        url = url + '?';

    if (path != undefined)
        url = url + 'path=' + nodetools.urlEncode(path);

    return url;
};

Controradio.prototype.addRadioResource = function () {
    var self = this;

    var radioResource = fs.readJsonSync(__dirname + '/radio_stations.json');
    var baseNavigation = radioResource.baseNavigation;

    self.rootStations = radioResource.rootStations;
    self.radioStations = radioResource.stations;
    self.rootNavigation = JSON.parse(JSON.stringify(baseNavigation));
    self.radioNavigation = JSON.parse(JSON.stringify(baseNavigation));
    self.rootNavigation.navigation.prev.uri = '/';
};

Controradio.prototype.getContentOfUrl = function (url) {
    var self = this;
    self.logger.info('[' + Date.now() + '] ' + '[80s80s] getContentOfUrl started with url ' + url);
    var defer = libQ.defer();    
 
    http.get(url, (resp) => {
    	if (resp.statusCode < 200 || resp.statusCode > 299) {
        	self.logger.info('[' + Date.now() + '] ' + '[80s80s] Failed to query api, status code: ' + resp.statusCode);
	    //self.errorToast('web', 'ERROR_STREAM_SERVER');
            // get fake data with duration = 15s
            let data = '';
            data = fs.readFileSync(__dirname + '/fake-data.json');
            defer.resolve(data);
	} else {
            let data = '';
    
            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });
    
            // The whole response has been received.
            resp.on('end', () => {
                defer.resolve(data);
            });
        }
	}).on("error", (err) => {
		self.logger.info('[' + Date.now() + '] ' + '[80s80s] Error: ' + err.message);
  		defer.resolve(null);
        self.errorToast('web', 'ERROR_STREAM_SERVER');
	});
    
    return defer.promise;
};

Controradio.prototype.loadRadioI18nStrings = function () {
    var self = this;
    self.i18nStrings = fs.readJsonSync(__dirname + '/i18n/strings_en.json');
    self.i18nStringsDefaults = fs.readJsonSync(__dirname + '/i18n/strings_en.json');
};

Controradio.prototype.getRadioI18nString = function (key) {
    var self = this;

    if (self.i18nStrings[key] !== undefined)
        return self.i18nStrings[key];
    else
        return self.i18nStringsDefaults[key];
};

Controradio.prototype.search = function (query) {
    return libQ.resolve();
};

Controradio.prototype.errorToast = function (station, msg) {
    var self = this;
    var errorMessage = self.getRadioI18nString(msg);
    errorMessage.replace('{0}', station.toUpperCase());
    self.commandRouter.pushToastMessage('error',
        self.getRadioI18nString('PLUGIN_NAME'), errorMessage);
};

Controradio.prototype.pushSongState = function (song) {
    var self = this;
    var rpState = {
        status: 'play',
        service: self.serviceName,
        type: 'track',
        trackType: self.getRadioI18nString('PLUGIN_NAME'),
        radioType: '80s80s',
        albumart: song.albumart,
        uri: song.uri,
        name: song.name,
        title: song.title,
        artist: currentChannel,
        album: song.album,
        streaming: true,
        disableUiControls: true,
        duration: song.duration,
        seek: 0,
        samplerate: '44.1 KHz',
        bitdepth: '16 bit',
        channels: 2
    };

    self.state = rpState;

    //workaround to allow state to be pushed when not in a volatile state
    var vState = self.commandRouter.stateMachine.getState();
    var queueItem = self.commandRouter.stateMachine.playQueue.arrayQueue[vState.position];

    queueItem.name = song.name;
    queueItem.artist = currentChannel;
    queueItem.album = song.album;
    queueItem.albumart = song.albumart;
    queueItem.trackType = self.getRadioI18nString('PLUGIN_NAME');
    queueItem.duration = song.duration;
    queueItem.samplerate = '44.1 KHz';
    queueItem.bitdepth = '16 bit';
    queueItem.channels = 2;

    //reset volumio internal timer
    self.commandRouter.stateMachine.currentSeek = 0;
    self.commandRouter.stateMachine.playbackStart=Date.now();
    self.commandRouter.stateMachine.currentSongDuration=song.duration;
    self.commandRouter.stateMachine.askedForPrefetch=false;
    self.commandRouter.stateMachine.prefetchDone=false;
    self.commandRouter.stateMachine.simulateStopStartDone=false;

    //volumio push state
    self.commandRouter.servicePushState(rpState, self.serviceName);
};

Controradio.prototype.setSongs = function (rpUri) {
    var self = this;
    return self.getContentOfUrl(rpUri)
    .then(function (eventResponse) {
        if (eventResponse !== null) {
            var response = JSON.parse(eventResponse);
            if (response.result === undefined) {
                self.errorToast('web', 'INCORRECT_RESPONSE');
            }
            var songsArray = response.result.entry;
            self.logger.info('[' + Date.now() + '] ' + '[80s80s] received new event containing ' + songsArray.length + ' songs.');
            return self.getSongsResponse(songsArray);
        }
    });
};

Controradio.prototype.getSongsResponse = function (songsArray) {
    var self = this;
    var response = [];
    for (var i = 0; i < songsArray.length; i++) {
        var currentSong = songsArray[i].song.entry[0];
        var coverUrl = currentSong.cover_art_url_xl;
        if(!coverUrl) {
            coverUrl = currentChannelCover;
        }
        response.push({
            service: self.serviceName,
            type: 'track',
            trackType: self.getRadioI18nString('PLUGIN_NAME'),
            radioType: 'web',
            albumart: coverUrl,
            name: currentSong.artist.entry[0].name + ' - ' + currentSong.title,
            title: currentSong.title,
            artist: currentSong.artist.entry[0].name,
            album: currentSong.collection_name,
            streaming: true,
            //disableUiControls: true,
            duration: songsArray[i].duration,
            airtime: songsArray[i].airtime,
            seek: 0,
            samplerate: '44.1 KHz',
            bitdepth: '16 bit',
            channels: 2
        });
    };
    return response;
};

Controradio.prototype.playNextTrack = function (songsArray) {
    var self = this;

    if(songsArray.length == 2) {
        self.logger.info('[' + Date.now() + '] ' + '[80s80s] Pushing the next song state: ' + songsArray[1].name);
        return libQ.resolve(self.pushSongState(songsArray[1]))
        .then(function () {
            //get now and calculate the difference
            //self.getContentOfUrl(timeUrl).then(function (currentTime) {
                var next = songsArray[0].airtime;
                var now = Math.floor(Date.now()); //var now = currentTime.st;
                self.logger.info('[' + Date.now() + '] ' + '[80s80s] PlayNextTrack API delay: ' + self.apiDelay);
                if(self.apiDelay) {
                    timeOffset = self.apiDelay * 1000;
                }  
                var duration = moment.duration(moment(next).diff(moment(now))) + timeOffset;
                if(duration < 5000) {
                    duration = songsArray[1].duration * 1000;
                }
                duration = parseInt(duration);
                var nextSongArray = [];
                nextSongArray.push(songsArray[0]);
                self.logger.info('[' + Date.now() + '] ' + '[80s80s] Setting timer to: ' + duration + ' milliseconds.');
                self.timer = new RPTimer(self.playNextTrack.bind(self), [nextSongArray], duration);
            //});
        });
    } else {
        // play track and get next one
        self.logger.info('[' + Date.now() + '] ' + '[80s80s] Pushing the next song state ' + songsArray[0].name + ' and getting next track.');
        var nextSongArray = [];
        return libQ.resolve(self.pushSongState(songsArray[0]))
        .then(function () {
            // get next
            self.setSongs(apiUrl + '&count=1').then(function(nextSong) {
                nextSongArray = nextSong;
                //self.getContentOfUrl(timeUrl).then(function (currentTime) {
                    // calculate time
                    var next = nextSongArray[0].airtime;
                    var now = Math.floor(Date.now()); //var now = currentTime.st;
                    self.logger.info('[' + Date.now() + '] ' + '[80s80s] PlayNextTrack API delay: ' + self.apiDelay);
                    if(self.apiDelay) {
                        timeOffset = self.apiDelay * 1000;
                    }
                    var duration = moment.duration(moment(next).diff(moment(now))) + timeOffset;
                    if(duration < 5000) {
                        duration = songsArray[0].duration * 1000;
                    }
                    duration = parseInt(duration);
                    self.logger.info('[' + Date.now() + '] ' + '[80s80s] Setting timer to: ' + duration + ' milliseconds.');
                    self.timer = new RPTimer(self.playNextTrack.bind(self), [nextSongArray], duration);
                //});
            });
        });
    }
};

function RPTimer(callback, args, delay) {
    var start, remaining = delay;

    var nanoTimer = new NanoTimer();

    RPTimer.prototype.pause = function () {
        nanoTimer.clearTimeout();
        remaining -= new Date() - start;
    };

    RPTimer.prototype.resume = function () {
        start = new Date();
        nanoTimer.clearTimeout();
        nanoTimer.setTimeout(callback, args, remaining + 'm');
    };

    RPTimer.prototype.clear = function () {
        nanoTimer.clearTimeout();
    };

    this.resume();
};
