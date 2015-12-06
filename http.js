var cadence    = require('cadence')  
  , logger     = require('prolific').createLogger('api.http')  
  , Dispatcher = require('inlet/dispatcher')
  , sys        = require('sys')
  , exec       = require('child_process').exec
  , http       = require('http');

 
var defines = {
	'COMMAND_ON' : '17',
	'COMMAND_OFF' : '20',
	'COMMAND_SET_VALUE' : '145',
	'COMMAND_GET_VALUE' : '136',
	'COMMAND_SET_RESULT' : '285',
	'STATUS_ON' : '1',
	'STATUS_OFF' : '0',
	'STATUS_UNKNOWN' : '2'
}

var devices = { }

function Api() {
    logger.info('startup', {event : 'initialization' }) 
    _read_devices(true);
}

Api.prototype.reportStatus = function () {
    logger.info('reportStatus', {event : 'running' }) 
    _read_devices(false);
}

Api.prototype.dispatcher = function () {
    var dispatcher = new Dispatcher(this)
    dispatcher.dispatch('POST .*', 'update')
    dispatcher.dispatch('GET /readdevices.*', 'read_devices')
    dispatcher.dispatch('GET /listdevices.*', 'list_devices')
    return dispatcher.createDispatcher()
}


Api.prototype.list_devices = cadence(function (async, request) { /* jshint unused: false */  
  	logger.info('api list_devices', request.url)
	//console.error("api list_devices", devices);
        return { data : devices, errors : [], pagination : [] }
})

Api.prototype.read_devices = cadence(function (async, request) {    
	_read_devices(false)
        return { message : "ok", errors : [], pagination : [] }
})

function _read_devices(reReadAll) {

	if (reReadAll) devices = { };

	var cmd = 'sqlite3 /database/apron.db "SELECT m.deviceID, m.interconnect, m.userName, d.basicType, \
                   d.genericType, d.specType, d.productType, \
                   a.attributeId, a.description as attributeName, s.value_get, s.value_set FROM zwaveDeviceState AS s \
                   LEFT JOIN zwaveAttribute AS a ON s.attributeId = a.attributeID \
                   LEFT JOIN zwaveDevice AS d ON d.nodeId = s.nodeID \
                   LEFT JOIN masterDevice as m ON d.masterID = m.deviceID where m.active='+"'"+'TRUE'+"'"+';"';

/*
 1|ZWAVE|Front Door Lock|4|64|3|1|10|Lock_Unlock|FALSE|FALSE\n
 1|ZWAVE|Front Door Lock|4|64|3|1|24|Alarm_Notifications_On_Off||TRUE\n
 1|ZWAVE|Front Door Lock|4|64|3|1|15|BatteryLevel|80|80\n
 4|ZWAVE|New POWER_SWITCH_MULTILEVEL|4|17|1|2|3|Level|69|69\n
 4|ZWAVE|New POWER_SWITCH_MULTILEVEL|4|17|1|2|4|Up_Down||\n
 4|ZWAVE|New POWER_SWITCH_MULTILEVEL|4|17|1|2|5|StopMovement||\n
 
*/


        executeWcb(cmd, function (out) {
		var lines = out.split('\n');
		var arrayLength = lines.length;
		var prevDev = -1;
		var attributes =  { };
		var devToUpdate = { };
		console.error("api prev -1 arrayLength:", arrayLength);
		if (arrayLength < 2) return;				// Something went wrong (Getting Dev -1)
		for (var i = 0; i < arrayLength-1; i++) {
			var attrToUpdate = { };
			var line = lines[i];
			var parts = line.split('|');
			if (prevDev > 0 && parts[0] != prevDev) {	// processing next device? 
				devToUpdate.attributes = attributes;
				if (!(prevDev in devices)) {
					devToUpdate.changed = true;
				} else {
					delete devices[prevDev].changed;
					if (JSON.stringify(devices[prevDev]) !== JSON.stringify(devToUpdate)) {
						devToUpdate.changed = true;
					}
				} 
				devices[prevDev] = devToUpdate;
//try {
				if ('changed' in devToUpdate) postDevice(prepDevice(devices[prevDev]));
//} catch (e) {
//    console.error(e.stack);
//}
				var devToUpdate = { };
				var attributes =  { };
//console.error("api read_devices devices loop", devices);
			}

			devToUpdate.unit	    = parts[0];
			prevDev 		   = parts[0];
			devToUpdate.interConnect    = parts[1];
			devToUpdate.userName        = parts[2];
			devToUpdate.basicType       = parts[3];
			devToUpdate.genericType     = parts[4];
			devToUpdate.specType        = parts[5];
			devToUpdate.productType     = parts[6];
			attrToUpdate.attributeID    = parts[7];
			if (parts[8]=="Lock_Unlock") parts[8]="Locked";
			attrToUpdate.attributeName  = parts[8];
			if (parts[9]=="TRUE") parts[9]="1";
			if (parts[9]=="FALSE") parts[9]="0";
			attrToUpdate.value_get      = parts[9];
			if (parts[10]=="TRUE") parts[10]="1";
			if (parts[10]=="FALSE") parts[10]="0";
			attrToUpdate.value_set      = parts[10];
			attributes[attrToUpdate.attributeID] = attrToUpdate;
		};

		// Add the last one
		devToUpdate.attributes = attributes;
		if (!(prevDev in devices)) {
			devToUpdate.changed = true;
		} else {
			delete devices[prevDev].changed;
			if (JSON.stringify(devices[prevDev]) !== JSON.stringify(devToUpdate)) {
				devToUpdate.changed = true;
			}
		} 
		devices[prevDev] = devToUpdate;
		if ('changed' in devToUpdate) postDevice(prepDevice(devices[prevDev]));
//console.error("api read_devices devices last one", devices);
	})
}

Api.prototype.update = cadence (function (async, request) {

	var command = request.body
  	logger.info('api update',command)

	var cmd = "undefined";

   	switch (command.commandid)
	{
	case defines.COMMAND_ON:
	case defines.COMMAND_OFF:
		if (command.unit == "999") {
			// Led Handling
			if (command.commandid == defines.COMMAND_OFF) {
				cmd = 'set_rgb 0 0 0';
			}
     		} else {
			switch (devices[command.unit].genericType)
			{
			case "64":	// lock
				var value = (command.commandid == defines.COMMAND_ON ? "TRUE" : "FALSE");
				attributeID = 10;
				break;
			case "17":	// Generic zwave Light
				var value = (command.commandid == defines.COMMAND_ON ? "TRUE" : "FALSE");
				attributeID = 4;
				break;
			case "16":	// Generic zwave switch *Siren
				var value = (command.commandid == defines.COMMAND_ON ? 255 : 0);
				attributeID = 1;
				break;
			}			
			cmd = 'aprontest -u -m' + command.unit + ' -t' + attributeID + ' -v' + value;
		}
		break
	case defines.COMMAND_SET_VALUE:
		if (command.unit == "999") {
     		// Led Handling
			switch (command.commandvalue)
			{
			case "1":
				cmd = 'set_rgb 255 0 0 0 0 0 flash 500000';
				break;
			}	
 	 	} else {
			var value = command.commandvalue;
			switch (devices[command.unit].genericType)
			{
			case "17":	// Generic zwave Light
				attributeID = 3;
				break;
			}			
			cmd = 'aprontest -u -m' + command.unit + ' -t' + attributeID + ' -v' + value;
		}
  		break
  	case defines.COMMAND_GET_VALUE:
	default:
		request.raise(400, 'No (recognized) command given')
    	break;
	}

	if (cmd != "undefined" && cmd != '') {	
		execute(cmd) 
		return { message : "ok" , command : cmd }
	} else {
	    return { message : "error", errors : [] }
	}

})

function prepDevice(device) {

//	console.error ("api prep device", device);
	var retDevice = clone(device);

	switch (device.genericType)
	{
	case "64":
		if (device['attributes'][10]['value_get'] != device['attributes'][10]['value_set']) {
			 retDevice['Locked'] = defines.STATUS_UNKNOWN;
		} else if (device['attributes'][10]['value_get'] == "TRUE") {
			 retDevice['Locked'] = defines.STATUS_ON;
		} else {
			 retDevice['Locked'] = defines.STATUS_OFF;
		}
		retDevice['Command'] = defines.COMMAND_SET_RESULT;
		break;
	case "17":
		if (device['attributes'][3]['value_get'] != device['attributes'][3]['value_set']) {
			 retDevice['Status'] = defines.STATUS_UNKNOWN;
		} else if (device['attributes'][3]['value_get'] > 0) {
			 retDevice['Status'] = defines.STATUS_ON;
		} else {
			 retDevice['Status'] = defines.STATUS_OFF;
		}
		retDevice['Command'] = defines.COMMAND_SET_RESULT;
		break;
	case "16":
		if (device['attributes'][1]['value_get'] != device['attributes'][1]['value_set']) {
			 retDevice['Status'] = defines.STATUS_UNKNOWN;
		} else if (device['attributes'][1]['value_get'] > 0) {
			 retDevice['Status'] = defines.STATUS_ON;
		} else {
			 retDevice['Status'] = defines.STATUS_OFF;
		}
		retDevice['Command'] = defines.COMMAND_SET_RESULT;
		break;
	}
//	console.error ("api prep device", retDevice);
	return retDevice;
}

function postDevice(device) {
// Build the post string from an object
// try {
  var post_data = JSON.stringify(device);

  // An object of options to indicate where to post to
  var post_options = {
      host: '192.168.2.101',
      port: '80',
      path: '/wink.php',
      method: 'POST',
      json: true,
      headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(post_data)
      }
  };

  // Set up the request
  var post_req = http.request(post_options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
          logger.info('Response: ' + chunk);
      });
  });

  // post the data
  post_req.write(post_data);
  post_req.end();

// } catch (e) {
    // console.error(e.stack);
// }
}

function execute(command){
	child = exec(command);
}

function executeWcb(command, callback){
	exec(command, function(error, stdout, stderr) {
	if(error !== null) {
		console.error ("api execute", stderr)
		callback(JSON.stringify(error)); 
		return
    	}
	if (stdout !== null) {
		callback(stdout); 
		return
	}
	return
    });
};

function clone(obj) {
    var copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

module.exports = Api
