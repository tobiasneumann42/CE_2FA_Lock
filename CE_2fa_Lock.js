/* Copyright (c) 2023 Cisco and/or its affiliates.
This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.1 (the "License"). You may obtain a copy of the
License at
           https://developer.cisco.com/docs/licenses
All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by the License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.

Version 1.1
Changelog
  Bugfix:
  - resolved bug in version 1.0 which required unlock icon to after time based standby/lock, to be pressed twice
  Enhancement:
  - include UI elements in JavaScript CE_2fa_ui_objects.js, macro no longer requires seperate XML file to be loaded into UI editor
*/

const xapi = require('xapi');

// customer domain used to complete email address, utilized to match Duo user
const domain = "tobiplayground.wbx.ai";

// Duo API parameters from Duo admin interface
const duoApiHostname = "api-<key>.duosecurity.com";
const duoIntegrationKey = "<integration key>";
const duoSecretKey = "<secret key>";
const duoPreAuthURL = "/auth/v2/preauth"
const duoAuthURL = "/auth/v2/auth"

const DEBUG = true;

let myResponse = [];
let preAuthData = [];
let lock_enabled = true;
let duoIdentity = "";
let duoDevice = "";

// script specific configuration elements
// send Duo authentication requests
xapi.Config.httpclient.mode.set('on').catch((error) => { console.error("initial system setup, enable http client", error); });
// in case Duo user has to enroll device
xapi.Config.WebEngine.mode.set('on').catch((error) => { console.error("initial system setup, enable WebEngine", error); });

// Duo API requests need to be digitally signed
// Cisco room OS lacks required functions, hence imported here
import {Crypto} from './20230817_CE_2fa_crypto_V1.1'
import {createPanel} from './20230817_CE_2fa_ui_objects_V1.1'

// Get the party started
function init() {
  return new Promise (function( resolve, reject) {
    /* retrieve personal device contact information
       example "tneumann@cisco.calls.webex.com"
       extract left hand side and combine with defined customer domain
    */
    xapi.Status.Userinterface.Contactinfo.ContactMethod[1].Number.get('UserInterface ContactInfo ContactMethod 1 Number').then(async(email) => {
      DEBUG && console.log("init, Personal Email", email);
      let fields = email.split("@")
      DEBUG && console.log("init, left hand", fields[0]);
      duoIdentity= fields[0] + "@" + domain;
      DEBUG && console.log("init, duo identity", duoIdentity);
      // set default state on startup to device locked
      let lock_enabled = true;
      let lockReturn = await lockUnlock(lock_enabled);
      DEBUG && console.log("init, lockReturn", lockReturn);
      resolve(duoIdentity)
    });
    setTimeout(() => {
      reject ('reject');
    }, 2000);
  })
}

// Duo API requires timestamp provided in RFC 2822 format
function getDate() {
  let dateNow = new Date();
  console.log("getDate, dateNow", dateNow);
  console.log("getData, internal", new Date().toUTCString());
  let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  let dayOfWeek = days[dateNow.getUTCDay()].substring(0,3);
  let day = dateNow.getUTCDate().toString().padStart(2, '0');
  let month = months[dateNow.getUTCMonth()].substring(0,3);
  let year = dateNow.getFullYear();
  let hours = dateNow.getUTCHours().toString().padStart(2, '0');
  let minutes = dateNow.getUTCMinutes().toString().padStart(2, '0');
  let seconds = dateNow.getUTCSeconds().toString().padStart(2, '0');

  return dayOfWeek + ", " + day + " " + month + " " + year + " " + hours + ":" + minutes + ":" + seconds + " " + "GMT"

}

// create and sign Duo API request
function signRequest(method, host, path, params, skey) {
  return new Promise (function(resolve) {
    let dateNow = getDate();

    DEBUG && console.log("signRequest, now", dateNow);
    let canonical = [dateNow, method.toUpperCase(), host.toLowerCase(), path];
    let paramString = ""

    DEBUG && console.log("signRequest, parameters input", params );
    let args = []
    Object.keys(params)
          .sort()
          .forEach(function(v) {
            DEBUG && console.log("signRequest, ", v, params[v])
            args = args.concat(v.toString() + "=" + params[v]);
          });

    paramString = args.join('&');
    canonical = canonical.concat(paramString.replace("@", "%40"));
    canonical = canonical.join("\n");

    let signature = Crypto.sha1_hmac( canonical, skey);
    DEBUG && console.log("signRequest, sha1 signature ", signature);
    resolve({paramDate: dateNow, paramString: paramString.replace("@", "%40"), signature: signature});
  })
}

// lock/unlock endpoint UI
async function lockUnlock(lock_state) {
    if (lock_state === true) {
        // hide all action buttons
        xapi.Config.UserInterface.Features.HideAll.set('True');
        console.log("lockUnlock, User interface hide all, off device... ")
        // turn off assistant, no access to calendar via voice commands
        xapi.Config.UserInterface.Assistant.Mode.set('off');
        console.log("lockUnlock, UI assistant mode off, off device... ")
        // turn off access to device settings, would allow to reenable assistant
        xapi.Config.UserInterface.SettingsMenu.Visibility.set('Hidden');
        console.log("lockUnlock, UI, settings menu , off device... ")
        // hide calendar details
        xapi.Config.UserInterface.Bookings.Visibility.Title.set('Hidden');
        console.log("lockUnlock, UI booking , disable device... ")
        xapi.Command.UserInterface.Extensions.Panel.Update({PanelId: 'Lock', Name: 'Unlock'});
        console.log("lockUnlock, UI extension panel, off  device... ")
        return("locked")
    }
    else {
        //xapi.config.set("UserInterface Features HideAll", "False");
        xapi.Config.UserInterface.Features.HideAll.set('False');
        console.log("lockUnlock, action buttons, enabling device... ")
        // turn on assistant
        //xapi.config.set("UserInterface Assistant Mode", "on");
         xapi.Config.UserInterface.Assistant.Mode.set('on');
        console.log("lockUnlock, UI, assistant mode  enabling device... ")
        // turn on access to device settings
        // xapi.config.set("UserInterface SettingsMenu Visibility", "Auto");
        xapi.Config.UserInterface.SettingsMenu.Visibility.set('Auto');
        console.log("lockUnlock, userinterface Menu, enabling device... ")
        // enable calendar details
        //xapi.config.set("UserInterface Bookings Visibility Title", "Auto");
        xapi.Config.UserInterface.Bookings.Visibility.Title.set('Auto');
        console.log("lockUnlock, user Interface booking  successful, enabling device... ")
        xapi.Command.UserInterface.Extensions.Panel.Update({PanelId: "Lock", Name: 'Lock'});
        console.log("lockUnlock, extension panel update , enabling device... ")
        return("unlocked")
    }
}

//compose and send authentication request, retrieve user duo devices
function send2Fa(host, date, url, params, sigBasic) {
    // reject removed
  return new Promise (function(resolve) {

    let basic = btoa(duoIntegrationKey + ':' + sigBasic);
    DEBUG && console.log("send2Fa basic ", basic, " - host ", host, " - url ", url, " - date ", date, " - params", params);
    let authToken="Authorization: Basic " + basic ;
    let contentType="Content-Type: application/x-www-form-urlencoded";
    let dateHeader="Date: " + date;
    let header = [dateHeader, authToken, contentType];
    // not used let duoResponse = "";
    DEBUG && console.log("header ", header);
    //xapi.command('HttpClient Post', {
      xapi.Command.HttpClient.Post({
      'Url': 'https://' + host + url + "?" + params,
      'Header': [dateHeader, authToken, contentType],
      'ResultBody': 'PlainText'
      }, '')
      // error handler, particularly important on codec boot as the POSTs might fail when remote device is not active yet
      .catch((error) => {
          console.log("send2Fa, error ", error);
      })
      .then((response) => {
        DEBUG && console.log("send2Fa, response ", response);
        if(response && response.StatusCode === '200') {
          DEBUG && console.log("send2Fa, postRequest, success - playload ", response['Body']);
          let duoResult = JSON.parse(response['Body']);
          DEBUG && console.log("send2Fa, ", duoResult);
          DEBUG && console.log("send2Fa, preAuth reponse ", duoResult.response.result);
          // enroll
          if (duoResult.response.result === 'enroll') {
            DEBUG & console.log('send2Fa, Enroll ', duoResult.response.enroll_portal_url);
            // xapi.command("UserInterface Extensions Panel Update", {PanelId: "Lock", Name: 'Lock'});
            // xapi.command("UserInterface Extensions Widget SetValue", {Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
            //xapi.command("UserInterface WebView Display", {Url: duoResult.response.enroll_portal_url, Mode: 'Modal' });
            xapi.Command.UserInterface.WebView.Display({Url: duoResult.response.enroll_portal_url, Mode: 'Modal' });
          } else if (duoResult.response.result === 'allow') {
            resolve( { authResult: true } );
          } // response from preAuth request
          else if (duoResult.response.result === 'auth') {
            DEBUG && console.log("send2Fa, preAuth, ",duoResult.response.devices);
            resolve({ preAuthResponse: { devices: duoResult.response.devices }});
          }
          // Duo authentication denied
          else if (duoResult.response.result === 'deny') {
            DEBUG && console.log("send2Fa, Duo authentication denied, ",duoResult.response.devices);
            xapi.Command.UserInterface.Message.Alert.Display({
              Duration: 5,
              Text: 'please try again',
              Title: 'Cisco Duo authentication failed!'
            });
          }
        } else if (response.StatusCode !== '200')
          DEBUG && console.log("send2Fa, http post error, ",response.StatusCode);
    });
  });
}

// Display available Duo devices widget, allow user to select on screen
function selectDuoPushDevice( deviceList ) {
    // removed reject (not used)
  return new Promise (function( resolve) {
  DEBUG && console.log('starting selectDuoPushDevice', deviceList.length);
  let pointer = 0
  let deviceListLen = deviceList.length;

  //xapi.Event.on("UserInterface Extensions Event Clicked", (event) => {
  xapi.Event.UserInterface.Extensions.Event.Clicked.on(event => {
  DEBUG && console.log("selectDuoPushDevice, ",event, " - ",event.Signal);
  if (pointer < deviceListLen -1 && event.Signal === 'duoDevice:increment') {
    DEBUG && console.log("selectDuoPushDevice, pointer increase, ", pointer);
    pointer++;
    //xapi.command("UserInterface Extensions Widget SetValue", {Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
    xapi.Command.UserInterface.Extensions.Widget.SetValue({Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
  } else if (pointer > 0 && event.Signal === 'duoDevice:decrement') {
    DEBUG && console.log("selectDuoPushDevice, pointer decrease, ", pointer);
    pointer--;
    //xapi.command("UserInterface Extensions Widget SetValue", {Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
    xapi.Command.UserInterface.Extensions.Widget.SetValue({Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
  }
  if (event.Signal === "executeAuthentication") {
      //xapi.command("UserInterface Extensions Panel Close");
      xapi.Command.UserInterface.Extensions.Panel.Close();
      resolve(deviceList[pointer].device);
    }
  });

  DEBUG && console.log("selectDuoPushDevice, devices ", deviceList);
  DEBUG && console.log("selectDuoPushDevice, length ", deviceListLen);
  if (deviceListLen >= 1) {
    console.log("selectDuoPushDevice, deviceList[pointer]", deviceList[pointer].display_name);
    //xapi.command("UserInterface Extensions Widget SetValue", { Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
    xapi.Command.UserInterface.Extensions.Widget.SetValue( { Value: deviceList[pointer].display_name, widgetId: 'widget_2'});
    //xapi.command("UserInterface Extensions Panel Open", {PanelId: 'duoAuthSelect'});
    xapi.Command.UserInterface.Extensions.Panel.Open({PanelId: 'duoAuthSelect'});
  }
  });
}

init().then((result) => {
  console.log(' Init done', result);
  })
    .catch((err) => {
    console.error(err);
});

createPanel();

async function executePreAuth() {
  // gather user devices with push capability only from Duo api, do this on first run and cache device list
  let result = await signRequest('POST', duoApiHostname, duoPreAuthURL, {username: duoIdentity}, duoSecretKey);
  result = await send2Fa(duoApiHostname, result.paramDate, duoPreAuthURL, result.paramString, result.signature);
      DEBUG && console.log("executePreAuth, event panel clicked ", result.preAuthResponse);
      // select only device with capability push
      let preAuthDataPushOnly = [];
      result.preAuthResponse.devices.forEach(function(entry) {
        if (Object.values(entry.capabilities).includes("push")) {
          preAuthDataPushOnly.push(entry);
        }
      })
      // save only push capable devices
      preAuthData = preAuthDataPushOnly;
      console.log("executePreAuth, PushOnly ", preAuthData, " - length ", preAuthData.length);
      return(preAuthData);
}

async function getPreAuthData() {
  DEBUG && console.log("start getPreauthData, lock status ", lock_enabled, "preAuthData ", preAuthData.length)
  if (lock_enabled && preAuthData.length === 0 ) {
    myResponse = await executePreAuth();
    DEBUG && console.log("getPreAuthData, my Response: ", myResponse, "lock State: ", lock_enabled, " length:", preAuthData.length);
  }
  //User could have more than one authentication device
  if (lock_enabled &&  preAuthData.length >= 1 ) {
    DEBUG && console.log("getPreAuthData, response ", myResponse);
    duoDevice = await selectDuoPushDevice(preAuthData);
    let result = await signRequest('POST', duoApiHostname, duoAuthURL, {device: duoDevice, factor: 'push', username: duoIdentity}, duoSecretKey);

    let response = await send2Fa(duoApiHostname, result.paramDate, duoAuthURL, result.paramString, result.signature );

    if (response.authResult && lock_enabled) {
      console.log("getPreAuthData, Authentication successful, enabling device... ")
      lock_enabled = false;
      let lock_return = await lockUnlock(lock_enabled);
      DEBUG && console.log("getPreAuthData, preAuthData", lock_return);                      }
  }
  else {
    lock_enabled = true ;
    let lock_return = await lockUnlock(lock_enabled);
    DEBUG && console.log("getPreAuthData, preAuthData", lock_return);
  }
}

/*function infiniteDoNotDisturb() {
    if (dndState === true) {
        xapi.command('Conference DoNotDisturb Activate', {
            Timeout: 1440
        }).catch(e => console.error('Command error'));
        setTimeout(infiniteDoNotDisturb, 1440 * 1000 * 60);
    } else {
        xapi.command('Conference DoNotDisturb Deactivate').catch(e => console.error('Command error'));
    }
}*/

//xapi.event.on("UserInterface Extensions Panel Clicked", (event) => {
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(event => {
    DEBUG && console.log("event panel clicked ", event)
    switch (event.PanelId) {
        case 'Lock':
            // handle lock button
            getPreAuthData();
    }
  });

// Handle device going into Halfwake, standby
xapi.Status.Standby.State.on(event => {
  switch(event){
    case 'Off':
      DEBUG && console.log("RING! Just woke up ");
      break;
    case 'Halfwake':
      DEBUG && console.log("entering Halfwake, ", lock_enabled);
      break;
    case 'Standby':
      DEBUG && console.log("entering standby, locking device... ");
      lockUnlock(true);
      lock_enabled = true;
        break;
    /*case 'EnteringStandby':
        break;*/
  }
})
