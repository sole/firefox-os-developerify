'use strict';

/* global require, console, process */

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var Promise = require('es6-promise').Promise;
var colors = require('colors');
var temp = require('temp');

var ADB = process.env.ADB || 'adb';

var tempDir;



var prefs = {
	'devtools.debugger.forbid-certified-apps': false,
	'devtools.debugger.prompt-connection': false,
	'b2g.adb.timeout': 0,
	// Reduce noise in logs: http://kb.mozillazine.org/Layout.css.report_errors
	'layout.css.report_errors': false
};

var settings = {
	'developer.menu.enabled': true,
	'ftu.manifestURL': null,
	'debugger.remote-mode': 'adb-devtools',
	'devtools.debugger.remote-enabled': true,
	'screen.timeout': 600, // 10min
	'lockscreen.locked': false,
	'lockscreen.enabled': false
};


developerify().then(function(res) {
	console.log('****** YOUR DEVICE HAS BEEN DEVELOPERIFIED ******'.blue);
});

function promisify(fn) {
	var args = Array.prototype.slice.call(arguments, 1);
	return new Promise(function(resolve, reject) {
		args.push(function(err) {
			if (err != null) {
				reject(err);
			} else {
				resolve.apply(null, Array.prototype.slice.call(arguments, 1));
			}
		});
		if (Array.isArray(fn)) {
			var scope = fn[0];
			var method = fn[1];
			scope[method].apply(scope, args);
		} else {
			fn.apply(null, args);
		}
	});
}

function developerify() {
	return setup()
		.then(waitForDevice)
		.then(stopB2G)
		.then(fetchSettings)
		.then(pushSettings)
		.then(pushPreferences)
		.then(startB2G);
}

function setup() {
	return new Promise(function(yay, nay) {
		temp.track();
		tempDir = temp.mkdirSync('flash-b2g');
		console.log('writing to ', tempDir);
		yay();
	});
}

function waitForDevice() {
	// Wait for device
	console.log('Waiting for device (is remote debugging on?) …'.yellow);
	return promisify(childProcess.exec, ADB + ' wait-for-device');
}

function stopB2G() {
	console.log('Stopping system');
	return promisify(childProcess.exec, [
		ADB + ' remount', // really needed?
		ADB + ' shell stop b2g'
	].join(' && '));
}

function fetchSettings() {
	
	return promisify(childProcess.exec, ADB + ' shell cat /system/b2g/defaults/settings.json', {
		maxBuffer: 524288
	});

}


function pushSettings(stdout) {
	console.log('push');
	var content;
	try {
		content = JSON.parse(stdout);
	} catch(e) {
		console.log('grrr', e);
	}
	
	for (var key in settings) {
		content[key] = settings[key];
	}
	var settingsPath = path.join(tempDir, 'settings.json');
	console.log('settingsPath', settingsPath);
	fs.writeFileSync(settingsPath, JSON.stringify(content));
	
	console.log('Appending to settings.json:\n', settings);
	
	return promisify(childProcess.exec, [
		ADB + ' shell mount -o rw,remount /system',
		ADB + ' push ' + settingsPath + ' /system/b2g/defaults/settings.json',
		ADB + ' shell mount -o ro,remount /system'
	].join(' && '));

}


function pushPreferences() {

	var cmds = ['cd /data/b2g/mozilla/*.default/']
		.concat(Object.keys(prefs).map(function(key) {
			return 'echo \'user_pref(' + JSON.stringify(key) + ', ' +
				JSON.stringify(prefs[key]) + ');\' >> prefs.js';
		})).join(' && ');
	console.log('Appending to prefs.js:\n', prefs);

	return promisify(childProcess.exec, ADB + ' shell "' +
		cmds.replace(/"/g, '\\"') + '"', {
			maxBuffer: 524288
		});

}

function startB2G() {
	console.log('Starting system');
	return promisify(childProcess.exec, ADB + ' shell sync && ' +
		ADB + ' shell start b2g')
}
