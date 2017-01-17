/*
    ___ usage: en_US ___
    usage: node server.js

    ___ usage ___
*/

var cadence  = require('cadence')
  , server   = require('./process/server')
  , os       = require('os')
  , path     = require('path')
  , fs       = require('fs')
  , execFile = require('child_process').execFile

require('arguable')(module, cadence(function (async) {
    var config = {
        heartbeat_port     : 8886
      , aau_port           : 8888
      , api_port           : 8333
      , wifi_port          : 80
      , hub_listen_port    : 9876
      , dryrun             : false
      , start              : 'wifi,api'
      }
      , platform = os.platform()

    // On the hub, log to a FIFO
    if (platform === 'linux') {
        var log_file = '/var/log/local-control-fifo'
        try {
            var fd = fs.openSync(log_file, 'w')
            fs.writeSync(fd, "local control server startup")
            require('prolific').sink = fs.createWriteStream(null, {fd: fd})
            console.log('local control logs will be written to ' + log_file)
        } catch (error) {
            console.error('couldn\'t open ' + log_file + ', logging to stdout instead')
        }
    }

    // On the hub, store data in /database. On the Relay, store in /data/local/ssl
    if (platform === 'linux') {config.datastore = path.join('/database', 'local_control_data')}
    else if (platform === 'android') {config.datastore = path.join('/data', 'local', 'ssl')}
    else {config.datastore = path.join(__dirname, '.', 'datastore')}

    // If we're on OSX, listen on 8887 instead of 80 so we don't need root
    if (platform === 'darwin') { config.wifi_port = 8887 }
    // If we're running on OSX ('darwin'), listen for the hub on all interfaces. Otherwise, only listen on localhost
    if (platform === 'darwin') { config.hub_listen_ip = '0.0.0.0' }
    else { config.hub_listen_ip = '127.0.0.1' }

    // Set variables to generate an SSL certificate using the generate-cert.sh script
    var script_interpreter = { android : '/system/bin/sh' }[platform] || '/bin/bash'
    var script_path = path.join(__dirname, './generate-cert.sh')
    config.cert = path.join(config.datastore, 'aau.crt')
    config.key = path.join(config.datastore, 'aau.key')
    config.ca = config.cert

    async(function (){
        execFile(script_interpreter, [script_path, '-d', config.datastore], async())
    }, function (){
        var loop
        loop = async(function () {
            if (config.dryrun) {
                console.log(config)
                return [ loop ]
            }
            server(config, async())
        })
    })
}))
