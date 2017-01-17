/*

    ___ usage: en_US ___
    usage: server/server < config.json

    Launch an amalgamated server configured and monitored by a wrapper process.

    description:

    Launch a single process that runs all of the server's services. The services
    will listen on different ports, but all services will share the same network
    interface and public IP address.

    Configuration is read from standard input. It is a JSON configuration file
    that is created by invoking the `server.js` process with sundry options
    specified on the command line or through environment variables.
    ___ usage ___

*/

var cadence = require('cadence')
  , abend = require('abend')
  , Resolver = require('conduit/resolver')
  , Authenticator = require('conduit/authenticator/static')
  , Transport = require('conduit/transport/reactive')
  , createListener = require('conduit/listener')
  , tcpContextualizer = require('conduit/tcp')
  , connect = require('connect')
  , net = require('net')

module.exports = cadence(function (async, config) {
    var fs = require('fs')
      , AAU = require('../aau/http')
      , Advertisement = require('../aau/advertisement')
      , Heartbeat = require('../heartbeat/http')
      , Wifi = require('../wifi/http')
      , Api = require('../api/http')
      , http = require('http')
      , https = require('https')
      , logger = require('prolific').createLogger('process.server')

    async(function () {
        require('prolific').setLevel('debug')
        logger.info('startup', { event : 'initialization', config : config })
        fs.readFile(config.ca, async())
        fs.readFile(config.key, async())
        fs.readFile(config.cert, async())
    }, function (ca, key, cert) {
        var pems = {
            ca   : ca
          , key  : key
          , cert : cert
        }
        config.start.split(/,/).forEach(function (service) {
            switch (service) {
                case 'api':
                    var api = new Api()
                    var server = http.createServer(api.dispatcher().server())
                    server.listen(config.api_port, '0.0.0.0', async())
 	 	    setInterval(api.reportStatus.bind(api), 1000 * 15)
                    break
                case 'heartbeat':
                    var heartbeat = new Heartbeat()
                    var server = http.createServer(heartbeat.dispatcher().server())
                    server.listen(config.heartbeat_port, '0.0.0.0', async())
                    break
                case 'wifi':
                    var wifi = new Wifi(config.datastore, require('./../wifi/scripts'))
                    var handler = connect()
                        .use(function (req, res, next) {
                            // Older android versions send a bogus heading
                            if (req.headers['content-encoding'] == "UTF-8") {
                                delete req.headers['content-encoding']
                            }
                            next()
                        })
                        .use(wifi.dispatcher().server())
                    var server = http.createServer(handler)
                    server.listen(config.wifi_port, '0.0.0.0', async())
                    break
                case 'aau':
                    var aau = new AAU()
                    var transport = new Transport(aau)
                    var authenticator = new Authenticator('aau')
                    var resolver = new Resolver(authenticator, transport, {})
                    var conduit = net.createServer(createListener(tcpContextualizer, resolver, abend))

                    setInterval(aau.keepAlive.bind(aau), 1000 * 2)
                    conduit.listen(config.hub_listen_port, config.hub_listen_ip)
                    aau.resolver = resolver
                    async(function () {
                        aau.initialize(config.datastore, async())
                    }, function () {
                        setInterval(function() {aau.updateTokens(aau.config.extractTokens())}, 1000 * 60 * 60) // check for expired tokens once per hour
                        var advertisment = new Advertisement()
                        advertisment.start(config.aau_port, aau.config.id.local_control_id)
                        setInterval(advertisment.checkIp.bind(advertisment), 1000 * 60)  // check IP every minute
                    }, function () {
                        var server = https.createServer(pems, aau.dispatcher().server())
                        server.listen(config.aau_port, '0.0.0.0', async())
                    })
                    break
            }
        })
    }, function () {
        logger.info('startup', { event : 'startup complete' })
    })
})

Error.stackTraceLimit = Infinity
