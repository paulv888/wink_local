# wink_local
Moved to node.js based on the /opt/local_control files on the Hub

Inspired by this and other Reddits https://www.reddit.com/r/winkhub/comments/3p2qwb/wink_firmware_219_nodejs_control_my_cree_light/ 
And of course PHP not working anymore

Has the following methods
- GET /readdevices to requery sqllite3 and sends back if statusses are changed
- GET /listdevices give a current status of in memory devices
- POST /json to change status of a device, over aprontest
- monitor status changes by querying sqllite3, (only queries/supports zWave) and post back to my back-end

POST examples, 
{"unit":"1","commandid":"17"} /* Open Lock */
or {"unit":"4","commandid":"145","commandvalue":"70"} /* Set light to Dim 70 */

Status update examples:
/* Door Lock status change */
{"unit":"1","interConnect":"ZWAVE","userName":"Front Door Lock","basicType":"4","genericType":"64","specType":"3","productType":"1","attributes":{"10":{"attributeID":"10","attributeName":"Lock_Unlock","value_get":"TRUE","value_set":"TRUE"},"15":{"attributeID":"15","attributeName":"BatteryLevel","value_get":"80","value_set":"80"},"24":{"attributeID":"24","attributeName":"Alarm_Notifications_On_Off","value_get":"","value_set":"TRUE"}},"changed":true,"Status":"1","Command":"285"}
/* Light Dim change */
{"unit":"4","interConnect":"ZWAVE","userName":"New POWER_SWITCH_MULTILEVEL","basicType":"4","genericType":"17","specType":"1","productType":"2","attributes":{"3":{"attributeID":"3","attributeName":"Level","value_get":"69","value_set":"69"},"4":{"attributeID":"4","attributeName":"Up_Down","value_get":"","value_set":""},"5":{"attributeID":"5","attributeName":"StopMovement","value_get":"","value_set":""}},"changed":true,"Status":"1","Command":"285"}
