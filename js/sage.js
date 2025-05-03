const { dialog } = require('electron').remote;
const path = require('path');
const os = require('os');
const fs = require('fs')
const { remote, ipcRenderer } = require('electron')
const { spawn } = require('child_process');
const ini = require('ini');
const electronScreen = require('electron').screen;
const Store = require('electron-store');
const store = new Store();
const customTitlebar = require('custom-electron-titlebar');

var scummvmConfig = {};
var scummyConfig = {};
var tempConfig = {};
var installed;
var installedCategories;
var selectedGame = "";
var selectedConfig = "";
var importGamePath = "";
var audioDevices = [];

//Menu.setApplicationMenu(null);

let titlebar = new customTitlebar.Titlebar({
  backgroundColor: customTitlebar.Color.fromHex('#1B262C'),
  menu: null,
  overflow: "hidden"
});

const gridObserver = new MutationObserver(() => {
  $(".grid").css("grid-template-columns", `repeat(auto-fill, minmax(${ $("#box-size").val() }px, 1fr))`);
});

gridObserver.observe(document.body, { childList: true, subtree: true });

/* ----------------------------------------------------------------------------
   LOAD PREFS AND SETUP THE GUI AT LAUNCH
---------------------------------------------------------------------------- */
var listMode = store.get('listMode');
if (listMode === undefined) listMode = "grid";
var groupItems = store.get('groupItems');
if (groupItems === undefined) groupItems = false;
var favorites = store.get('favorites');
if (favorites === undefined) favorites = [];
var defaultVersion = store.get('defaultVersion');
if (defaultVersion === undefined) defaultVersion = {};
var selectedCategory = store.get('selectedCategory');
if (selectedCategory === undefined) selectedCategory = "all";
var recentList = store.get('recentList');
if (recentList === undefined) recentList = [];
var scummyConfig = store.get('scummyConfig');
if (scummyConfig === undefined) scummyConfig = {};
var boxSize = store.get('boxSize');
if (boxSize === undefined) boxSize = 200;

// Migrate settings to 1.1.0+
if (listMode == "gallery") {
  listMode = "grid";
  store.set('listMode', listMode);
}

$(`#${listMode}-view`).addClass("active");
if (groupItems) $("#group-items").addClass("active");
$("#box-size").val(boxSize);

parseScummyConfig();
checkInitState();

/* ----------------------------------------------------------------------------
   HANDLE GUI EVENTS, SUCH AS CLICKING AND MOVING THE MOUSE
---------------------------------------------------------------------------- */

$("#gui-show-title").on("click", () => {
  scummyConfig["showTitles"] = $("#gui-show-title").prop("checked");
  store.set('scummyConfig', scummyConfig);
  drawGames();
});

$("#gui-show-favorite-icon").on("click", () => {
  scummyConfig["showFavoriteIcon"] = $("#gui-show-favorite-icon").prop("checked");
  store.set('scummyConfig', scummyConfig);
  drawGames();
});

$("#init-next-1").on("click", () => {
  hideModal("#scummy-init-modal-1");
  showModal("#scummy-init-modal-2");
  $("#init-scummvm-executable-error").hide();
});

$("#init-back-2").on("click", () => {
  hideModal("#scummy-init-modal-2");
  showModal("#scummy-init-modal-1");
});

$("#init-back-3").on("click", () => {
  hideModal("#scummy-init-modal-3");
  showModal("#scummy-init-modal-2");
});

$("#init-next-2").on("click", () => {
  hideModal("#scummy-init-modal-2");
  showModal("#scummy-init-modal-3");
  $("#init-scummvm-config-error").hide();
  let tempPath = getScummvmConfigPath();
  $("#init-scummvm-config-path").html(tempPath);
});

$("#init-next-3").on("click",  async () => {
  hideModal("#scummy-init-modal-3");
  scummyConfig['scummvmConfigPath'] = $("#init-scummvm-config-path").text();
  scummyConfig['scummvmPath'] = $("#init-scummvm-executable-path").text();
  store.set('scummyConfig', scummyConfig);
  await loadScummvmConfig();
  getInstalledGames();
  getAudioDevices();
  $(".sideBar").fadeIn(500, function() {
    $(".leftMenuBar").fadeIn(500);
    $(".rightMenuBar").fadeIn(500, function() {
      $(".main").fadeIn(500);
    });
  });
});

$("#change-scummvm-path").on("click", () => {
  $("#scummvm-executable-error").fadeOut(250);
  let tempPath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      "title": "Locate the ScummVM executable",
      "message": "Locate the ScummVM executable.",
      "properties": [
        'openFile'
      ]
  })
  if (tempPath) {
    $("#scummvm-executable-path").html(tempPath);
    let launchOptions = ['--help'];
    let rawData = "";
    let scummvmFile = path.basename(tempPath.toString());
    let scummvmPath = path.dirname(tempPath.toString());
    if (os.type() == 'Darwin') {
      scummvmPath = tempPath+"/Contents/MacOS";
      scummvmFile = "./scummvm";
    }
    let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
    scummvm.stdout.on('data', (data) => {
      rawData += data.toString();
    });

    scummvm.stderr.on('data', (data) => {
    });

    scummvm.on('exit', (code) => {
      rawDataList = rawData.split("\r\n");
      if ((os.type() == "Darwin") || (os.type() == "Linux")) rawDataList = rawData.split("\n");
      if (rawDataList[0].includes("ScummVM")) {
        $("#scummy-configure-modal-save").removeClass("disabled-option");
      } else {
        $("#scummy-configure-modal-save").addClass("disabled-option");
        $("#scummvm-executable-error").fadeIn(250);
      }
    })
  }
});

$("#change-scummvm-config-path").on("click", () => {
  $("#scummvm-config-error").fadeOut(250);
  let tempPath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      "title": "Locate the ScummVM configuration file",
      "message": "Locate the ScummVM configuration file.",
      "properties": [
        'openFile'
      ]
  })
  if (tempPath) {
    $("#scummvm-configuration-path").html(tempPath);
    if (!verifyScummvmConfigurationFile(tempPath)) {
      $("#scummy-configure-modal-save").addClass("disabled-option");
      $("#scummvm-config-error").fadeIn(250);
    }
  }
});

$("#init-scummvm-path").on("click", () => {
  $("#init-scummvm-executable-error").fadeOut(250);
  let tempPath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      "title": "Locate the ScummVM executable",
      "message": "Locate the ScummVM executable.",
      "properties": [
        'openFile'
      ]
  })
  if (tempPath) {
    $("#init-scummvm-executable-path").html(tempPath);
    let launchOptions = ['--help'];
    let rawData = "";
    let scummvmFile = path.basename(tempPath.toString());
    let scummvmPath = path.dirname(tempPath.toString());
    if (os.type() == 'Darwin') {
      scummvmPath = tempPath+"/Contents/MacOS";
      scummvmFile = "./scummvm";
    }
    let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
    scummvm.stdout.on('data', (data) => {
      rawData += data.toString();
    });

    scummvm.stderr.on('data', (data) => {
      rawData += data.toString();
    });

    scummvm.on('exit', (code) => {
      rawDataList = rawData.split("\r\n");
      if ((os.type() == "Darwin") || (os.type() == "Linux")) rawDataList = rawData.split("\n");
      if ((rawDataList[0].includes("ScummVM")) || (rawDataList[1].includes("ScummVM"))) {
        $("#init-next-2").removeClass("disabled-option");
      } else {
        $("#init-next-2").addClass("disabled-option");
        $("#init-scummvm-executable-error").fadeIn(250);
      }
    })
  }
});

$("#init-choose-scummvm-config-path").on("click", () => {
  $("#init-scummvm-config-error").fadeOut(250);
  let tempPath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      "title": "Locate the ScummVM Configuration File",
      "message": "Locate the ScummVM Configuration File.",
      "properties": [
        'openFile'
      ]
  })
  if (tempPath) {
    $("#init-scummvm-config-path").html(tempPath);
    if (!verifyScummvmConfigurationFile(tempPath)) {
      $("#init-next-3").addClass("disabled-option");
      $("#init-scummvm-config-error").fadeIn(250);
    } else {
      $("#init-next-3").removeClass("disabled-option");
    }
  }
});

$("#add-game").on("click", () => {
  let addPath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      "title": "Add Game",
      "message": "Choose the directory containing the game to add.",
      "properties": [
        'openDirectory'
      ]
  })
  if (addPath) {
    detectGame(addPath[0]);
  }
});

$("#grid-view").on("click", () => {
  if (!$("grid-view").hasClass("active")) {
    $("#list-view").removeClass("active");
    $("#grid-view").addClass("active");
    listMode = "grid";
    store.set('listMode', listMode);
    drawGames();
  }
});

$("#list-view").on("click", () => {
  if (!$("list-view").hasClass("active")) {
    $("#grid-view").removeClass("active");
    $("#list-view").addClass("active");
    listMode = "list";
    store.set('listMode', listMode);
    drawGames();
  }
});

$("#group-items").on("click", () => {
  if (!$("#group-items").hasClass("active")) {
    $("#group-items").addClass("active");
    groupItems = true;
    store.set('groupItems', groupItems);
    drawGames();
  } else {
    $("#group-items").removeClass("active");
    groupItems = false;
    store.set('groupItems', groupItems);
    drawGames();
  }
});

$(".launch-config").on("click", ".configure", function(e) {
  let configName = $(this).parent().data("version");
  selectedConfig = configName;
  drawGameConfig();
});

$(".launch-config").on("click", ".default", function(e) {
  let configName = $(this).parent().data("version");
  selectedConfig = configName;
  defaultVersion[selectedGame] = configName;
  store.set('defaultVersion', defaultVersion);
  drawGameInfo(selectedGame);
});

$(".launch-config").on("click", ".play", function(e) {
  let gameShortName = $(this).parent().data("version");
  launchGame(selectedGame, gameShortName);
});

$(".launch-config").on("click", ".remove", function(e) {
  let category = gameData[selectedGame]['category'];
  let imagePath = __dirname+`/boxart/${selectedGame}.jpg`;
  try {
    fs.accessSync(imagePath, fs.constants.R_OK);
  } catch(err) {
     imagePath = "boxart/missing.jpg";
  }
  selectedConfig = $(this).parent().data("version");
  let imageObj = $("<img></img", {"src": imagePath});
  $("#remove-modal").children(".modal-wrapper").children(".modal-body").children(".modal-boxart").html(imageObj);
  let versionString = "";
  for (i=0; i<installed[selectedGame]['versions'].length; i++) {
    if (installed[selectedGame]['versions'][i]['versionShortName'] == selectedConfig) versionString = installed[selectedGame]['versions'][i]['version'];
  }
  let versionObj = $("<small></small>").text(`(${versionString})`);
  let gameNameObj = $("<span></span>", {"class": "game-name"}).text(installed[selectedGame]['name']).append(versionObj);
  $("#remove-modal").children(".modal-wrapper").children(".modal-body").children(".modal-message").html(gameNameObj).append("Remove this game from SCUMMVM?");
  showModal("#remove-modal");
});

$(".game-info-boxart").on("click", ".game-info-favorite", function(e) {
  if (favorites.includes(selectedGame)) {
    let favoriteTextObj = $("<i></i>", {"class": "fas fa-heart"});
    $(this).removeClass("active").html(favoriteTextObj).append(" Favorite");
    favorites.splice(favorites.indexOf(selectedGame),1);
    $(`#${selectedGame}`).find("span").find("i").remove();
    if (selectedCategory == "favorites") $(`#${selectedGame}`).remove();
  } else {
    let favoriteTextObj = $("<i></i>", {"class": "fas fa-heart-broken"});
    $(this).addClass("active").html(favoriteTextObj).append(" Unfavorite");
    favorites.push(selectedGame);
    $(`#${selectedGame}`).find("span").prepend("<i class='fas fa-heart fa-fw favorite-pink'></i>");
  }
  store.set('favorites', favorites);
  $("#favorites").html(favorites.length);
});

$("#override-graphics").on("click", function() {
  enableDisableGraphicsOptionsGui();
});

$("#override-audio").on("click", function() {
  enableDisableAudioOptionsGui();
});

$("#override-volume").on("click", function() {
  enableDisableVolumeOptionsGui();
});

$(".sideBar").on("mouseenter", () => {
  $(".sideBar").addClass("hasScrollBar");
}).on("mouseleave", () => {
  $(".sideBar").removeClass("hasScrollBar");
});

$(".modal-body").on("mouseenter", () => {
  $(".modal-body").addClass("hasScrollBar");
}).on("mouseleave", () => {
  $(".modal-body").removeClass("hasScrollBar");
});

$(".main").on("mouseenter", () => {
  $(".main").addClass("hasScrollBar");
}).on("mouseleave", () => {
  $(".main").removeClass("hasScrollBar");
});

$(".sideBar").on("click", ".sideBarItem", function(e) {
  $(".sideBarItem").removeClass("selected");
  $(this).addClass("selected");
  selectedCategory = $(this).attr("id").split("-")[1];
  store.set('selectedCategory', selectedCategory);
  drawGames();
});

$("#scummy-view-options").on("click", function() {
  if (!$("#view-menu").hasClass("view-menu-visible")) {
    $("#gui-show-title").prop("checked", scummyConfig['showTitles']);
    $("#gui-show-favorite-icon").prop("checked", scummyConfig['showFavoriteIcon']);
    $("#view-menu").addClass("view-menu-visible");
    let buttonIcon = $("<i></i>", {"class": "fas fa-chevron-left fa-fw"});
    $("#scummy-view-options").html(buttonIcon);
  } else {
    $("#view-menu").removeClass("view-menu-visible");
    let buttonIcon = $("<i></i>", {"class": "fas fa-chevron-right fa-fw"});
    $("#scummy-view-options").html(buttonIcon);    
  }
});

$("#box-size").on("input", function() {
  let minSize = $(this).val();
  animateGridSize(boxSize, minSize);
  boxSize = minSize;
  store.set('boxSize', minSize);
  $(".grid").css("grid-template-columns", `repeat(auto-fill, minmax(${minSize}px, 1fr))`);
});

$("#scummy-configure").on("click", function() {
  showModal("#scummy-configure-modal");
  $("#scummvm-executable-error").hide();
  $("#scummvm-config-error").hide();
  $("#scummvm-executable-path").html(scummyConfig['scummvmPath']);
  $("#scummvm-configuration-path").html(scummyConfig['scummvmConfigPath']);
  $("#gui-show-categories").prop("checked", scummyConfig['showCategories']);
  $("#gui-show-recents").prop("checked", scummyConfig['showRecentCategory']);
  $("#gui-max-recents").val(scummyConfig['recentMax']);
  $("#gui-max-recents-text").html(scummyConfig['recentMax']);
});

$("#gui-max-recents").on("input", function() {
  $("#gui-max-recents-text").html($("#gui-max-recents").val());
});

$(".main").on("click", ".game", function(e) {
  let gameId = $(this).attr("id");
  let version = defaultVersion[gameId];
  launchGame(gameId, version);
});

$("#context-menu").on("click", ".manage", function(e) {
  let gameId = $(this).attr("id");
  drawGameInfo(gameId);
});

$("#context-menu").on("click", ".play", function(e) {
  let shortName = $(this).data("version");
  let id = $(this).data("id");
  launchGame(id, shortName);
});

$("#context-menu").on("click", ".favorite", function(e) {
  if (favorites.includes(selectedGame)) {
    let favoriteTextObj = $("<i></i>", {"class": "fas fa-heart"});
    $(this).removeClass("active").html(favoriteTextObj).append(" Favorite");
    favorites.splice(favorites.indexOf(selectedGame),1);
    $(`#${selectedGame}`).find("span").find("i").remove();
    if (selectedCategory == "favorites") $(`#${selectedGame}`).remove();
  } else {
    let favoriteTextObj = $("<i></i>", {"class": "fas fa-heart-broken"});
    $(this).addClass("active").html(favoriteTextObj).append(" Favorite");
    favorites.push(selectedGame);
    $(`#${selectedGame}`).find("span").prepend("<i class='fas fa-heart fa-fw favorite-pink'></i>");
  }
  store.set('favorites', favorites);
  $("#favorites").html(favorites.length);
  $("#context-menu").fadeOut(250);
});

$(".main").on("contextmenu", ".game", function(e) {
  let gameId = $(this).attr("id");
  selectedGame = gameId;
  if (listMode == "grid") $(this).children("img").addClass("active");
  if (listMode == "list") $(this).addClass("active");
  $("#context-menu").children(".launch-items").html("");
  for (i=0; i<installed[gameId]['versions'].length; i++) {
    if (installed[gameId]['versions'][i]['version'] == "Default") {
      let menuIconObj = $("<i></i>", {"class": "fas fa-play fa-fw"});
      let menuItemObj = $("<div></div>", {"class": "play menu-item"}).html(menuIconObj).append(" Play");
      $("#context-menu").children(".launch-items").append(menuItemObj);
    } else {
      let menuIconObj = $("<i></i>", {"class": "fas fa-play fa-fw"});
      let menuItemObj;
      let versionShortName = installed[gameId]['versions'][i]['versionShortName'];
      if (versionShortName == defaultVersion[gameId]) {
        menuItemObj = $("<div></div>", {"class": "play menu-item", "data-id": gameId, "data-version": versionShortName}).html(menuIconObj).append("Play "+installed[gameId]['versions'][i]['version']+" <i class='fas fa-star'></i>");
      } else {
        menuItemObj = $("<div></div>", {"class": "play menu-item", "data-id": gameId, "data-version": versionShortName}).html(menuIconObj).append("Play "+installed[gameId]['versions'][i]['version']);
      }
      $("#context-menu").children(".launch-items").append(menuItemObj);
    }
  }
  if (favorites.includes(selectedGame)) {
    $("#context-menu").find(".favorite").html("<i class='fas fa-heart-broken fa-fw'></i> Unfavorite").addClass("active");
  } else {
    $("#context-menu").find(".favorite").html("<i class='fas fa-heart fa-fw'></i> Favorite").removeClass("active");
  }
  $("#context-menu").children(".manage").attr("id", gameId);
  $("#context-menu").css({left: e.pageX-50, top: e.pageY-50}).fadeIn(250);
});

$("#context-menu").on("mouseleave", () => {
  $("#context-menu").fadeOut(250);
  if (listMode == "grid") $(`#${selectedGame}`).children("img").removeClass("active");
  if (listMode == "list") $(`#${selectedGame}`).removeClass("active");
});

$("#game-configure-modal").on("click", ".engine-option", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  tempConfig[shortName][flag] = $(`#${flag}`).prop("checked");
});

$("#game-configure-modal").on("click", ".graphic-option", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  if  ($(`#${flag}`).prop("checked")) {
    tempConfig[shortName][flag] = $(`#${flag}`).prop("checked");
  } else {
    delete tempConfig[shortName][flag];
  }
});

$("#game-configure-modal").on("click", ".audio-option", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  if (flag == "speech_mute") {
    tempConfig[shortName][flag] = (!$(`#${flag}`).prop("checked"));
  } else {
    tempConfig[shortName][flag] = $(`#${flag}`).prop("checked");
  }
});

$("#game-configure-modal").on("change", "select", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  if ($(this).val() == "default") {
    delete tempConfig[shortName][flag]
  } else {
    tempConfig[shortName][flag] = $(this).val();
  }
});

$("#game-configure-modal").on("input", ".audio-option-slider", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  tempConfig[shortName][flag] = $(this).val();
  $(`#span-${flag}`).html($(this).val());
});

$("#game-configure-modal").on("input", ".volume-option-slider", function(e) {
  let flag = $(this).attr("id");
  let shortName = selectedConfig;
  tempConfig[shortName][flag] = $(this).val();
  $(`#span-${flag}`).html($(this).val());
});

$("#add-modal-no").on("click", () => {
  hideModal("#add-modal");
});

$("#add-modal-yes").on("click", () => {
  hideModal("#add-modal");
  importGame(importGamePath);
});

$("#remove-modal-no").on("click", () => {
  hideModal("#remove-modal");
});

$("#remove-modal-yes").on("click", () => {
  removeGame(selectedConfig);
  selectedConfig = "";
  selectedGame = "";
  hideModal("#remove-modal");
});

$("#exists-modal-close").on("click", () => {
  hideModal("#exists-modal");
});

$("#unknown-modal-close").on("click", () => {
  hideModal("#unknown-modal");
});

$("#game-info-close").on("click", () => {
  $("#game-info").fadeOut(250);
});

$("#game-configure-modal-cancel").on("click", () => {
  tempConfig = {};
  $("#game-configure-modal").fadeOut(250);
});

$("#scummy-configure-modal-cancel").on("click", () => {
  $("#scummy-configure-modal").fadeOut(250);
});

$("#scummy-configure-modal-save").on("click", () => {
  saveScummyConfig();
  $("#scummy-configure-modal").fadeOut(250);
});


$("#game-configure-modal-save").on("click", async () => {
  let shortName = selectedConfig;
  enableDisableGraphicsOptions(shortName);
  enableDisableAudioOptions(shortName);
  enableDisableVolumeOptions(shortName);
  scummvmConfig = JSON.parse(JSON.stringify(tempConfig));
  await ipcRenderer.invoke('write-ini-config', 
    scummyConfig['scummvmConfigPath'],
    scummvmConfig);
  $("#game-configure-modal").fadeOut(250);
});


/* ----------------------------------------------------------------------------
   FUNCTIONS
---------------------------------------------------------------------------- */
function animateGridSize(start, end, duration = 500) {
  let stepCount = 20; // Number of steps in the animation
  let stepSize = (end - start) / stepCount;
  let currentSize = start;
  let stepInterval = duration / stepCount;

  function step() {
      currentSize += stepSize;

      // Stop when we reach the target value
      if ((stepSize > 0 && currentSize >= end) || (stepSize < 0 && currentSize <= end)) {
          currentSize = end; // Ensure precise final value
          clearInterval(animationInterval);
      }

      $(".gridr").css("grid-template-columns", `repeat(auto-fill, minmax(${currentSize}px, 1fr))`);
  }

  let animationInterval = setInterval(step, stepInterval);
}

function enableDisableGraphicsOptions(gameShortName) {
  if ($("#override-graphics").prop("checked")) {
    tempConfig[gameShortName]['gfx_mode'] = $("#gfx_mode").val();
    tempConfig[gameShortName]['render_mode'] = $("#render_mode").val();
    tempConfig[gameShortName]['stretch_mode'] = $("#stretch_mode").val();
    tempConfig[gameShortName]['aspect_ratio'] = $("#aspect_ratio").prop("checked");
    tempConfig[gameShortName]['fullscreen'] = $("#fullscreen").prop("checked");
    tempConfig[gameShortName]['filtering'] = $("#filtering").prop("checked");
  } else {
    delete tempConfig[gameShortName]['gfx_mode'];
    delete tempConfig[gameShortName]['render_mode'];
    delete tempConfig[gameShortName]['stretch_mode'];
    delete tempConfig[gameShortName]['aspect_ratio'];
    delete tempConfig[gameShortName]['fullscreen'];
    delete tempConfig[gameShortName]['filtering'];
  }
}

function enableDisableAudioOptions(gameShortName) {
  if ($("#override-audio").prop("checked")) {
    tempConfig[gameShortName]['music_driver'] = $("#music_driver").val();
    tempConfig[gameShortName]['opl_driver'] = $("#opl_driver").val();
    tempConfig[gameShortName]['speech_mute'] = (!$("#speech_mute").prop("checked"));
    tempConfig[gameShortName]['subtitles'] = $("#subtitles").prop("checked");
    tempConfig[gameShortName]['talkspeed'] = $("#talkspeed").val();
  } else {
    delete tempConfig[gameShortName]['music_driver'];
    delete tempConfig[gameShortName]['opl_driver'];
    delete tempConfig[gameShortName]['speech_mute'];
    delete tempConfig[gameShortName]['subtitles'];
    delete tempConfig[gameShortName]['talkspeed'];
  }
}

function enableDisableVolumeOptions(gameShortName) {
  if ($("#override-volume").prop("checked")) {
    tempConfig[gameShortName]['music_volume'] = $("#music_volume").val();
    tempConfig[gameShortName]['sfx_volume'] = $("#sfx_volume").val();
    tempConfig[gameShortName]['speech_volume'] = $("#speech_volume").val();
  } else {
    delete tempConfig[gameShortName]['music_volume'];
    delete tempConfig[gameShortName]['sfx_volume'];
    delete tempConfig[gameShortName]['speech_volume'];
  }
}

function enableDisableGraphicsOptionsGui() {
  if ($("#override-graphics").prop("checked")) {
    $(".graphics-options-wrapper").removeClass("disabled-option");
  } else {
    $(".graphics-options-wrapper").addClass("disabled-option");
  }
}

function enableDisableAudioOptionsGui() {
  if ($("#override-audio").prop("checked")) {
    $(".audio-options-wrapper").removeClass("disabled-option");
  } else {
    $(".audio-options-wrapper").addClass("disabled-option");
  }
}

function enableDisableVolumeOptionsGui() {
  if ($("#override-volume").prop("checked")) {
    $(".volume-options-wrapper").removeClass("disabled-option");
  } else {
    $(".volume-options-wrapper").addClass("disabled-option");
  }
}

function graphicsOverridden(gameShortName) {
  let override = false;
  if ('gfx_mode' in scummvmConfig[gameShortName]) override = true;
  if ('render_mode' in scummvmConfig[gameShortName]) override = true;
  if ('stretch_mode' in scummvmConfig[gameShortName]) override = true;
  if ('aspect_ratio' in scummvmConfig[gameShortName]) override = true;
  if ('fullscreen' in scummvmConfig[gameShortName]) override = true;
  if ('filtering' in scummvmConfig[gameShortName]) override = true;
  return override;
}

function audioOverridden(gameShortName) {
  let override = false;
  if ('music_driver' in scummvmConfig[gameShortName]) override = true;
  if ('opl_driver' in scummvmConfig[gameShortName]) override = true;
  if ('speech_mute' in scummvmConfig[gameShortName]) override = true;
  if ('subtitles' in scummvmConfig[gameShortName]) override = true;
  if ('talkspeed' in scummvmConfig[gameShortName]) override = true;
  return override;
}

function volumeOverridden(gameShortName) {
  let override = false;
  if ('music_volume' in scummvmConfig[gameShortName]) override = true;
  if ('sfx_volume' in scummvmConfig[gameShortName]) override = true;
  if ('speech_volume' in scummvmConfig[gameShortName]) override = true;
  return override;
}

function launchGame(gameId, shortName) {
  let lastPosition = recentList.indexOf(gameId);
  if (lastPosition > -1) recentList.splice(lastPosition, 1);
  recentList.unshift(gameId);
  recentList.splice(scummyConfig['recentMax']);
  store.set('recentList', recentList);
  if (selectedCategory == "recent") drawGames();
  let launchOptions = [];
  let installPath = scummvmConfig[shortName]['path'].split("\\").join("\\\\");
  let tempConfigPath = writeTempConfig(shortName);
  launchOptions.push(`--config="${tempConfigPath}"`);
  launchOptions.push(gameId);
  let rawData = "";
  let scummvmFile = path.basename(scummyConfig['scummvmPath']);
  let scummvmPath = path.dirname(scummyConfig['scummvmPath']);
  if (os.type() == 'Darwin') {
    scummvmPath = scummyConfig['scummvmPath']+"/Contents/MacOS";
    scummvmFile = "./scummvm";
  }
  let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
  showWaiting(installed[gameId]['name']);
  scummvm.stdout.on('data', (data) => {
  });

  scummvm.stderr.on('data', (data) => {
  });

  scummvm.on('exit', (code) => {
    hideWaiting();
  });
}

function drawGameConfig() {
  tempConfig = JSON.parse(JSON.stringify(scummvmConfig));
  $(".engine-options-wrapper").html("");
  $(".graphics-options-wrapper").html("");
  $(".audio-options-wrapper").html("");
  $(".volume-options-wrapper").html("");
  let engine = gameData[selectedGame]['engine'];
  let gameShortName = selectedConfig;
  if (engineOptions[engine].length == 0) {
    let optionObj = $("<div></div>", {"class": "modal-option"}).text("There are no configuration options for this engine.");
    $(".engine-options-wrapper").append(optionObj);
    $("#game-configure-modal-yes").hide();
    $("#game-configure-modal-cancel").html("OK");
  } else {
    for (i=0; i<engineOptions[engine].length; i++) {
      let option = engineOptions[engine][i];
      inputObj = $("<input>", {"type": "checkbox", "id": option['flag'], "class": "engine-option"});
      optionObj = $("<div></div>", {"class": "modal-option"}).html(inputObj).append(` ${option['shortDesc']}`);
      $(".engine-options-wrapper").append(optionObj);
      if (tempConfig[gameShortName][option['flag']]) {
        $(`#${option['flag']}`).prop("checked", true);
      }
    }
  }
  for (i=0; i<generalGameOptions['graphics'].length; i++) {
    let option = generalGameOptions['graphics'][i];
    if (option['type'] == "bool") {
      inputObj = $("<input>", {"type": "checkbox", "id": option['flag'], "class": "graphic-option"});
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(inputObj).append(` ${option['label']}`);
      $(".graphics-options-wrapper").append(optionObj);
      if (tempConfig[gameShortName][option['flag']]) $(`#${option['flag']}`).prop("checked", true);
    }
    if (option['type'] == "list") {
      selectObj = $("<select></select>", {"id": option['flag']});
      for (o=0; o<option['values'].length; o++) {
        let selectOption = option['values'][o];
        optionObj = $("<option></option>", {"value": selectOption['value']}).text(selectOption['text']);
        $(selectObj).append(optionObj);
      }
      tdLabelObj = $("<td></td>").html(option['label']);
      tdSelectObj = $("<td></td>").html(selectObj);
      trObj = $("<tr></tr>").append(tdLabelObj).append(tdSelectObj);
      tableObj = $("<table></table>").html(trObj);
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(tableObj);
      $(".graphics-options-wrapper").append(optionObj);
      if (option['flag'] in tempConfig[gameShortName]) $(`#${option['flag']}`).val(tempConfig[gameShortName][option['flag']]);
    }
  }
  for (i=0; i<generalGameOptions['audio'].length; i++) {
    let option = generalGameOptions['audio'][i];
    if (option['type'] == "bool") {
      inputObj = $("<input>", {"type": "checkbox", "id": option['flag'], "class": "audio-option"});
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(inputObj).append(` ${option['label']}`);
      $(".audio-options-wrapper").append(optionObj);
      if (option['mode'] == "invert") {
        if (tempConfig[gameShortName][option['flag']]) {
          $(`#${option['flag']}`).prop("checked", false);
        } else {
          $(`#${option['flag']}`).prop("checked", true);
        }
      } else {
        if (tempConfig[gameShortName][option['flag']]) {
          $(`#${option['flag']}`).prop("checked", true);
        } else {
          $(`#${option['flag']}`).prop("checked", false);
        }
      }
    }
    if (option['type'] == "list") {
      selectObj = $("<select></select>", {"id": option['flag']});
      for (o=0; o<option['values'].length; o++) {
        let selectOption = option['values'][o];
        optionObj = $("<option></option>", {"value": selectOption['value']}).text(selectOption['text']);
        $(selectObj).append(optionObj);
      }
      tdLabelObj = $("<td></td>").html(option['label']);
      tdSelectObj = $("<td></td>").html(selectObj);
      trObj = $("<tr></tr>").append(tdLabelObj).append(tdSelectObj);
      tableObj = $("<table></table>").html(trObj);
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(tableObj);
      $(".audio-options-wrapper").append(optionObj);
      if (option['flag'] in tempConfig[gameShortName]) $(`#${option['flag']}`).val(tempConfig[gameShortName][option['flag']]);
    }
    if (option['type'] == "nlst") {
      selectObj = $("<select></select>", {"id": option['flag']});
      for (o=0; o<audioDevices.length; o++) {
        let selectOption = audioDevices[o];
        optionObj = $("<option></option>", {"value": selectOption['value']}).text(selectOption['text']);
        $(selectObj).append(optionObj);
      }
      tdLabelObj = $("<td></td>").html(option['label']);
      tdSelectObj = $("<td></td>").html(selectObj);
      trObj = $("<tr></tr>").append(tdLabelObj).append(tdSelectObj);
      tableObj = $("<table></table>").html(trObj);
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(tableObj);
      $(".audio-options-wrapper").append(optionObj);
      if (option['flag'] in tempConfig[gameShortName]) $(`#${option['flag']}`).val(tempConfig[gameShortName][option['flag']]);
    }
    if (option['type'] == "slid") {
      inputObj = $("<input>", {"type": "range", "id": option['flag'], "min": option['min'], "max": option['max'], "value": option['default'], "class": "audio-option-slider"});
      tdLabelObj = $("<td></td>").html(option['label']);
      valObj = $("<span></span>", {"id": `span-${option['flag']}`, "class": "audio-option-value"}).text(tempConfig[gameShortName][option['flag']]);
      tdInputObj = $("<td></td>").html(inputObj).append(valObj);
      trObj = $("<tr></tr>").append(tdLabelObj).append(tdInputObj);
      tableObj = $("<table></table>").html(trObj);
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(tableObj);
      $(".audio-options-wrapper").append(optionObj);
      if (option['flag'] in tempConfig[gameShortName]) $(`#${option['flag']}`).val(tempConfig[gameShortName][option['flag']]);
    }
  }
  for (i=0; i<generalGameOptions['volume'].length; i++) {
    let option = generalGameOptions['volume'][i];
    if (option['type'] == "slid") {
      inputObj = $("<input>", {"type": "range", "id": option['flag'], "min": option['min'], "max": option['max'], "value": option['default'], "class": "volume-option-slider"});
      tdLabelObj = $("<td></td>").html(option['label']);
      valObj = $("<span></span>", {"id": `span-${option['flag']}`, "class": "volume-option-value"}).text(tempConfig[gameShortName][option['flag']]);
      tdInputObj = $("<td></td>").html(inputObj).append(valObj);
      trObj = $("<tr></tr>").append(tdLabelObj).append(tdInputObj);
      tableObj = $("<table></table>").html(trObj);
      optionObj = $("<div></div>", {"class": "modal-option indent"}).html(tableObj);
      $(".volume-options-wrapper").append(optionObj);
      if (option['flag'] in tempConfig[gameShortName]) $(`#${option['flag']}`).val(tempConfig[gameShortName][option['flag']]);
    }
  }
  if (graphicsOverridden(gameShortName)) $("#override-graphics").prop("checked", true);
  if (audioOverridden(gameShortName)) $("#override-audio").prop("checked", true);
  if (volumeOverridden(gameShortName)) $("#override-volume").prop("checked", true);
  enableDisableGraphicsOptionsGui();
  enableDisableAudioOptionsGui();
  $("#game-configure-modal-yes").show();
  $("#game-configure-modal-cancel").html("Cancel");
  showModal("#game-configure-modal");
}

function drawCategories() {
  if (!scummyConfig['showRecentCategory']) $("#category-recent").hide();
  $("#sideBarCategories").html("");
  $("#all").html(Object.keys(installed).length);
  $("#favorites").html(favorites.length);
  installedCategories = {};
  Object.keys(categories).forEach(key => {
    installedCategories[key] = {"count": 0, "installed": []};
  });
  Object.keys(installed).forEach(key => {
    installedCategories[gameData[key]['category']]['count'] += 1;
    installedCategories[gameData[key]['category']]['installed'].push(key);
  });
  Object.keys(categories).sort().forEach(key => {
    if (installedCategories[key]['count'] > 0) {
      let tmpIcon = $("<i></i>", {"class": "fas fa-bookmark fa-fw bookmark"});
      let tmpCount = $("<span></span>", {"class":"badge"}).text(installedCategories[key]['count']);
      let tmpObject = $("<div></div>", {"class":"sideBarItem", "id": `category-${key}`}).text(categories[key]).prepend(tmpIcon).append(tmpCount);
      $("#sideBarCategories").append(tmpObject);
    }
  });
  $(`#category-${selectedCategory}`).addClass("selected");
  if (!scummyConfig['showCategories']) {
    $("#sideBarCategories").hide();
    if (selectedCategory != "category-all") $("#category-all").click()
  }
}

function drawGameInfo(gameId) {
  selectedGame = gameId;
  let category = gameData[gameId]['category'];
  boxartId = gameId.replace(":", "_");
  let imagePath = __dirname+`/boxart/${boxartId}.jpg`;
  try {
    fs.accessSync(imagePath, fs.constants.R_OK);
  } catch(err) {
     imagePath = "boxart/missing.jpg";
  }
  let gameImageObj = $("<img></img", {"src": imagePath});
  let favoriteTextObj = $("<i></i>", {"class": "far fa-heart"});
  let favoriteObj = $("<div></div>", {"class": "game-info-favorite"}).html(favoriteTextObj).append(" Favorite");
  let titleObj = $("<div></div>", {"class": "game-info-title"});
  $(".launch-config").html(titleObj);
  let longName = installed[gameId]['name'];
  if (longName.substr(-5, 5) == ", The") longName = "The "+longName.substr(0,longName.length - 5);
  $(".game-info-title").html(longName);
  $(".game-info-boxart").html(gameImageObj).append(favoriteObj);
  for (i=0; i<installed[gameId]['versions'].length; i++) {
    let gameVersionId = installed[gameId]['versions'][i]['versionShortName'];
    let versionObj = $("<span></span>", {"class":"game-info-version"}).text(installed[gameId]['versions'][i]['version']);
    let wrapperObj = $("<div></div>", {"class": "game-info-wrapper"}).html(versionObj);
    $(".launch-config").append(wrapperObj);
    let menuIconObj = $("<i></i>", {"class": "fas fa-play fa-fw"});
    let menuItemObj = $("<div></div>", {"class": "menuButton no-left-margin bright-green play"}).html(menuIconObj).append(" Play");
    let cfgIconObj = $("<i></i>", {"class": "fas fa-cog fa-fw"});
    let cfgItemObj = $("<div></div>", {"class": "menuButton bright configure"}).html(cfgIconObj).append(" Configure");
    let defaultIconObj = $("<i></i>", {"class": "fas fa-star fa-fw"});
    let buttonClass = "";
    if (gameVersionId == defaultVersion[selectedGame]) buttonClass = "active";
    let defaultItemObj = $("<div></div>", {"class": `menuButton default ${buttonClass}`}).html(defaultIconObj).append(" Default");
    let removeIconObj = $("<i></i>", {"class": "fas fa-trash fa-fw"});
    let removeItemObj = $("<div></div>", {"class": "menuButton bright-red remove"}).html(removeIconObj).append(" Remove");
    wrapperObj = $("<div></div>", {"class": "game-info-wrapper", "id": i, "data-version": gameVersionId})
      .html(menuItemObj).append(cfgItemObj).append(defaultItemObj).append(removeItemObj);
    $(".launch-config").append(wrapperObj);
    if (i < installed[gameId]['versions'].length - 1) {
      let hrObj = $("<hr>", {"class": "game-info-divider"});
      $(".launch-config").append(hrObj);
    }
  }
  if (favorites.includes(selectedGame)) {
    let favoriteTextObj = $("<i></i>", {"class": "fas fa-heart-broken"});
    $(".game-info-favorite").addClass("active").html(favoriteTextObj).append(" Unfavorite").addClass("active");

  }
  $("#context-menu").fadeOut(250);
  $("#game-info").fadeIn(250);
}

function drawGames() {
  $(".grid").remove();
  $(".list").remove();
  $(".main").html("")
  if (groupItems) {
    if (selectedCategory == "all") {
      let listId = 1;
      Object.keys(categories).sort().forEach(key => {
        if (installedCategories[key]['count'] > 0) {
          let groupHeader = $("<div></div>", {"class": "group-header"}).text(categories[key]);
          if (listId == 1) groupHeader.addClass("first");
          $(".main").append(groupHeader);
          listId = drawGameList(installedCategories[key]['installed'], listId);
        }
      });
    }
    if (selectedCategory == "favorites") {
      let listId = 1;
      favoriteCategories = {};
      for (i=0; i<favorites.length; i++) {
        categoryKey = gameData[favorites[i]]['category'];
        if (!(categoryKey in favoriteCategories)) favoriteCategories[categoryKey] = [];
        favoriteCategories[categoryKey].push(favorites[i]);
      }
      Object.keys(favoriteCategories).sort().forEach(key => {
        let groupHeader = $("<div></div>", {"class": "group-header"}).text(categories[key]);
        if (listId == 1) groupHeader.addClass("first");
        $(".main").append(groupHeader);
        listId = drawGameList(favoriteCategories[key], listId);
      });
    } 
    if (selectedCategory == "recent") {
      let listId = 1;
      recentCategories = {};
      for (i=0; i<recentList.length; i++) {
        if (recentList[i] in installed) {
          categoryKey = gameData[recentList[i]]['category'];
          if (!(categoryKey in recentCategories)) recentCategories[categoryKey] = [];
          recentCategories[categoryKey].push(recentList[i]);
        }
      }
      Object.keys(recentCategories).sort().forEach(key => {
        let groupHeader = $("<div></div>", {"class": "group-header"}).text(categories[key]);
        if (listId == 1) groupHeader.addClass("first");
        $(".main").append(groupHeader);
        listId = drawGameList(recentCategories[key], listId);
      });
    } 
    if ((selectedCategory != "favorites") && (selectedCategory != "all") && (selectedCategory != "recent")) {
      listId = 1;
      let categoryList = {};
      Object.keys(installed).forEach(key => {
        if (selectedCategory == gameData[key]['category']) categoryList[installed[key]['name']] = key;
      });
      let groupHeader = $("<div></div>", {"class": "group-header"}).text(categories[selectedCategory]);
      if (listId == 1) groupHeader.addClass("first");
      $(".main").append(groupHeader);
      listId = drawGameList(categoryList, listId);
    }
  } else {
    if ((selectedCategory != "favorites") && (selectedCategory != "all") && (selectedCategory != "recent")) {
      let categoryList = {};
      Object.keys(installed).forEach(key => {
        if (selectedCategory == gameData[key]['category']) categoryList[installed[key]['name']] = key;
      });
      listId = drawGameList(categoryList);
    } else {
      drawGameList(Object.keys(installed));  
    }
    
  }
  
}

function drawGameList(gameList, listId=1) {
  let longNames = {};
  if (selectedCategory == "recent") {
    recentList.forEach(key => {
      if (gameList.includes(key)) {
        longNames[installed[key]['name']] = key;
      }
    });
  }
  if (selectedCategory == "all") {
    gameList.forEach(gameId => {
      longNames[installed[gameId]['name']] = gameId;
    });
  }
  if (selectedCategory == "favorites") {
    favorites.forEach(gameId => {
      if (gameList.includes(gameId)) {
        longNames[installed[gameId]['name']] = gameId;
      }
    });
  }
  if ((selectedCategory != "favorites") && (selectedCategory != "all") && (selectedCategory != "recent")) {
    longNames = gameList;
  }
  let tempGameList = Object.keys(longNames);
  if (selectedCategory != "recent") tempGameList = Object.keys(longNames).sort();
  let gamesContainer = $("<div></div>", {"class": listMode, "id": "listContainer"+listId.toString()});
  $(".main").append(gamesContainer);
    tempGameList.forEach(key => {
      let category = gameData[longNames[key]]['category'];
      let boxart = longNames[key].replace(":","_");
      let imagePath = __dirname+`/boxart/${boxart}.jpg`;
      try {
        fs.accessSync(imagePath, fs.constants.R_OK);
      } catch(err) {
        console.log(`Missing: boxart/${boxart}.jpg`);
         imagePath = "boxart/missing.jpg";
      }
      let gameImageObj = $("<img></img", {"src": imagePath});
      let favoriteObj = "";
      if (scummyConfig['showFavoriteIcon']) {
        if (favorites.includes(longNames[key])) favoriteObj = $("<i></i>", {"class": "fas fa-heart fa-fw favorite-pink"}).append(" ");
      }
      let gameNameObj;
      if ((scummyConfig['showTitles']) || (listMode == "list")) gameNameObj = $("<span></span>").html(key).prepend(favoriteObj);
      let sdefault = defaultVersion[longNames[key]];
      let rowObj = $("<div></div>", {"class": "game", "id": longNames[key], "data-id": key, "data-version": sdefault}).append(gameImageObj).append(gameNameObj);
      $("#listContainer"+listId.toString()).append(rowObj);
    });
    return listId+1;
}

function getInstalledGames() {
  installed = {};
  for (const key in scummvmConfig) {
    if (key != "scummvm") {
      let gameName = scummvmConfig[key]['description'].replace(/\s\([^()]*\)$/, '');
      let versionText = scummvmConfig[key]['description'].replace(/.*\(([^()]+)\)$/, '$1');
      let gameId = scummvmConfig[key]['engineid']+":"+scummvmConfig[key]['gameid'];
      if (gameId in installed) {
        installed[gameId]['versions'].push({"version": versionText, "versionShortName": key});
      } else {
        if (gameName.substr(0, 4) == "The ") gameName = gameName.substr(4) + ", The";
        installed[gameId] = {"name": gameName, "versions": []};
        installed[gameId]['versions'].push({"version": versionText, "versionShortName": key});
      }
    }
  }
  updateDefaultVersions();
  drawCategories();
  drawGames();
}

function updateDefaultVersions() {
  Object.keys(installed).forEach(key => {
    if (defaultVersion.hasOwnProperty(key)) {
      let foundVersion = false;
      for (v=0; v<installed[key]['versions'].length; v++) {
        if (installed[key]['versions'][v]['versionShortName'] == defaultVersion[key]) foundVersion = true;
      }
      if (! foundVersion) defaultVersion[key] = installed[key]['versions'][0]['versionShortName'];
    } else {
      defaultVersion[key] = installed[key]['versions'][0]['versionShortName'];
    }
  });
  store.set('defaultVersion', defaultVersion);
}

function getScummvmConfigPath() {
  let scummvmConfigPath = "";
  if (os.type() == 'Windows_NT') scummvmConfigPath = process.env.APPDATA+"\\ScummVM\\scummvm.ini";
  if (os.type() == 'Darwin') scummvmConfigPath = process.env.HOME+"/Library/Preferences/ScummVM Preferences";
  if (os.type() == 'Linux') scummvmConfigPath = process.env.HOME+"/.config/scummvm/scummvm.ini";
  return scummvmConfigPath;
}

async function loadScummvmConfig() {
  scummvmConfig = await ipcRenderer.invoke('read-ini-config', scummyConfig['scummvmConfigPath']);
}

function showWaiting(gameName) {
  let textObj = $("<span></span>").html(`Playing <b>${gameName}</b>.`);
  let iconObj = $("<i></i>", {"class": "fas fa-circle-notch fa-spin"});
  let innerObj = $("<div></div>", {"class": "inner"}).html(iconObj).append(textObj);
  let wrapperObj = $("<div></div>", {"class": "waiting"}).append(innerObj);
  $(document.body).prepend(wrapperObj);
  $(".waiting").fadeIn(500);
}

function hideWaiting() {
  $(".waiting").fadeOut(500, () => {
    $(".waiting").remove();
  });
}

function writeTempConfig(shortName) {
    let tempConfig = [];
    let lineEnd;
    if (os.type() == 'Windows_NT') tempConfigPath = process.env.APPDATA+"\\Scummy\\temp.ini";
    if (os.type() == 'Darwin') tempConfigPath = process.env.HOME+"/Library/Preferences/Scummy";
    if (os.type() == 'Linux') tempConfigPath = os.tmpdir();
    tempConfig.push("[scummvm]");
    Object.keys(scummvmConfig['scummvm']).forEach(key => {
      tempConfig.push(`${key}=${scummvmConfig['scummvm'][key]}`);
    });
    Object.keys(scummvmConfig[shortName]).forEach(key => {
      tempConfig.push(`${key}=${scummvmConfig[shortName][key]}`);
    });
    fs.writeFileSync(tempConfigPath, tempConfig.join("\n"), {encoding: "utf8"});
    return tempConfigPath;
}

function detectGame(gamePath) {
  gamePath = gamePath.split("\\").join("\\\\");
  importGamePath = gamePath;
  let launchOptions = ['--detect', `--path="${gamePath}"`];
  let rawData = "";
  let scummvmFile = path.basename(scummyConfig['scummvmPath']);
  let scummvmPath = path.dirname(scummyConfig['scummvmPath']);
  if (os.type() == 'Darwin') {
    scummvmPath = scummyConfig['scummvmPath']+"/Contents/MacOS";
    scummvmFile = "./scummvm";
  }
  let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
  scummvm.stdout.on('data', (data) => {
    rawData += data.toString();
  });

  scummvm.stderr.on('data', (data) => {
  });

  scummvm.on('exit', (code) => {
    rawDataList = rawData.split("\r\n");
    if ((os.type() == "Darwin") || (os.type() == "Linux")) rawDataList = rawData.split("\n");
    let gameId = rawDataList[2].replace(/(.+?:.+?)\s{1,}.*/, '$1');
    let completeGameName = rawDataList[2].replace(/.+?\s{1,}(.+?\))\s{1,}.*/, '$1');
    let gameName = completeGameName.replace(/\s\([^()]*\)$/, '');
    const versionText = completeGameName.replace(/.*\(([^()]+)\)$/, '$1');
    if (gameId.includes(":")) {
      let boxart = gameId.replace(":","_");
      if (!gameData.hasOwnProperty(gameId)) {
        alert("Unknown error: gameId = "+gameId);
        return;
      }
      let category = gameData[gameId]['category'];
      let imagePath = __dirname+`/boxart/${boxart}.jpg`;
      try {
        fs.accessSync(imagePath, fs.constants.R_OK);
      } catch(err) {
         imagePath = "boxart/missing.jpg";
      }
      let alreadyInstalled = false;
      if (gameId in installed) {
        for (i=0; i<installed[gameId]['versions'].length; i++) {
          if (installed[gameId]['versions'][i]['version'] == versionText) alreadyInstalled = true;
        }
      }
      if (alreadyInstalled) {
        let imageObj = $("<img></img", {"src": imagePath});
        $("#exists-modal").children(".modal-wrapper").children(".modal-body").children(".modal-boxart").html(imageObj);
        let versionObj = $("<small></small>").text(`(${versionText})`);
        let gameNameObj = $("<span></span>", {"class": "game-name"}).text(gameName).append(versionObj);
        $("#exists-modal").children(".modal-wrapper").children(".modal-body").children(".modal-message").html(gameNameObj).append("This version of this game has already been imported.");
        showModal("#exists-modal");
      }
      if ((!alreadyInstalled) && (gameId in installed)) {
        let imageObj = $("<img></img", {"src": imagePath});
        $("#add-modal").children(".modal-wrapper").children(".modal-body").children(".modal-boxart").html(imageObj);
        let versionObj = $("<small></small>").text(`(${versionText})`);
        let gameNameObj = $("<span></span>", {"class": "game-name"}).text(gameName).append(versionObj);
        $("#add-modal").children(".modal-wrapper").children(".modal-body").children(".modal-message").html(gameNameObj).append("A new version of this game has been detected. Would you like to import it?");
        showModal("#add-modal");
      }
      if ((!alreadyInstalled) && (!(gameId in installed))) {
        let imageObj = $("<img></img", {"src": imagePath});
        $("#add-modal").children(".modal-wrapper").children(".modal-body").children(".modal-boxart").html(imageObj);
        let versionObj = $("<small></small>").text(`(${versionText})`);
        let gameNameObj = $("<span></span>", {"class": "game-name"}).text(gameName).append(versionObj);
        $("#add-modal").children(".modal-wrapper").children(".modal-body").children(".modal-message").html(gameNameObj).append("A game has been detected. Would you like to import it?");
        showModal("#add-modal");
      }
    } else {
      alertObj = $("<i></i>", {"class": "fas fa-exclamation-triangle warning-color fa-3x"});
      $("#unknown-modal").children(".modal-wrapper").children(".modal-body").children(".modal-boxart").html(alertObj);
      $("#unknown-modal").children(".modal-wrapper").children(".modal-body").children(".modal-message").html("No game was detected.");
      showModal("#unknown-modal");
    }
  })
}


function importGame(gamePath) {
  let launchOptions = ['--add', `--path="${gamePath}"`];
  let rawData = "";
  let scummvmFile = path.basename(scummyConfig['scummvmPath']);
  let scummvmPath = path.dirname(scummyConfig['scummvmPath']);
  if (os.type() == 'Darwin') {
    scummvmPath = scummyConfig['scummvmPath']+"/Contents/MacOS";
    scummvmFile = "./scummvm";
  }
  let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
  scummvm.stdout.on('data', (data) => {
    rawData += data.toString();
  });

  scummvm.stderr.on('data', (data) => {
  });

  scummvm.on('exit', (code) => {
    afterImportGame();
  })
}

async function afterImportGame() {
  await loadScummvmConfig();
  getInstalledGames();
  drawGames();
}

function getAudioDevices() {
  audioDevices = [];
  let launchOptions = ['--list-audio-devices'];
  let rawData = "";
  let scummvmFile = path.basename(scummyConfig['scummvmPath']);
  let scummvmPath = path.dirname(scummyConfig['scummvmPath']);
  if (os.type() == 'Darwin') {
    scummvmPath = scummyConfig['scummvmPath']+"/Contents/MacOS";
    scummvmFile = "./scummvm";
  }
  let scummvm = spawn(scummvmFile, launchOptions, {'cwd': scummvmPath, 'shell': true});
  scummvm.stdout.on('data', (data) => {
    rawData += data.toString();
  });

  scummvm.stderr.on('data', (data) => {
  });

  scummvm.on('exit', (code) => {
    rawDataList = rawData.split("\r\n");
    if ((os.type() == "Darwin") || (os.type() == "Linux")) rawDataList = rawData.split("\n");
    for (i=2; i<rawDataList.length; i++) {
      let parsedData = rawDataList[i].match(/"(.+?)"(.+)/);
      if (parsedData) {
        let value = parsedData[1];
        let text = parsedData[2].trim();
        audioDevices.push({"value": value, "text": text});
      }
    }
  })
}

async function removeGame(configName) {
  delete scummvmConfig[configName];
  await ipcRenderer.invoke('write-ini-config', 
                           scummyConfig['scummvmConfigPath'],
                           scummvmConfig);
  getInstalledGames();
  drawGames();
  $("#game-info-close").trigger("click");
}

function parseScummyConfig() {
  if (!scummyConfig.hasOwnProperty("showTitles")) scummyConfig['showTitles'] = true;
  if (!scummyConfig.hasOwnProperty("showFavoriteIcon")) scummyConfig['showFavoriteIcon'] = true;
  if (!scummyConfig.hasOwnProperty("showCategories")) scummyConfig['showCategories'] = true;
  if (!scummyConfig.hasOwnProperty("showRecentCategory")) scummyConfig['showRecentCategory'] = true;
  if (!scummyConfig.hasOwnProperty("recentMax")) scummyConfig['recentMax'] = 10;
  if (!scummyConfig.hasOwnProperty("scummvmPath")) scummyConfig['scummvmPath'] = "";
  if (!scummyConfig.hasOwnProperty("scummvmConfigPath")) scummyConfig['scummvmConfigPath'] = "";
}

function saveScummyConfig() {
  scummyConfig["showTitles"] = $("#gui-show-title").prop("checked");
  scummyConfig["showFavoriteIcon"] = $("#gui-show-favorite-icon").prop("checked");
  scummyConfig["showCategories"] = $("#gui-show-categories").prop("checked");
  scummyConfig["showRecentCategory"] = $("#gui-show-recents").prop("checked");
  scummyConfig["recentMax"] = $("#gui-max-recents").val();
  scummyConfig["scummvmPath"] = $("#scummvm-executable-path").text();
  scummyConfig["scummvmConfigPath"] = $("#scummvm-configuration-path").text();
  store.set('scummyConfig', scummyConfig);
  if (scummyConfig["showCategories"]) {
    $("#sideBarCategories").fadeIn(250);
  } else {
    if ((selectedCategory != "category-favorites") && (selectedCategory != "category-all") && (selectedCategory != "category-recent")) $("#category-all").trigger("click");
    $("#sideBarCategories").fadeOut(250);
  }
  if (scummyConfig["showRecentCategory"]) {
    $("#category-recent").fadeIn(250);
  } else {
    if (selectedCategory != "category-recent") $("#category-all").trigger("click");
    $("#category-recent").fadeOut(250);
  }
  drawGames();
}

function showScummySetup() {
  showModal("#scummy-init-modal-1");
}

async function checkInitState() {
  if (scummyConfig['scummvmPath'] == "") {
    $(".sideBar").hide();
    $(".main").hide();
    $(".leftMenuBar").hide();
    $(".rightMenuBar").hide();
    showScummySetup();
  } else {
    await loadScummvmConfig();
    getInstalledGames();
    getAudioDevices();
  }
}

async function verifyScummvmConfigurationFile(configPath) {
  let testScummvmConfig = await ipcRenderer.invoke('read-ini-config', scummyConfig['scummvmConfigPath']);
  return (testScummvmConfig.hasOwnProperty("scummvm"));
}

function showModal(modalId) {
  $(modalId).fadeIn(250);
}

function hideModal(modalId) {
  $(modalId).fadeOut(250);
}