const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const ini = require('ini');
const Store = require('electron-store');
const store = new Store();

function createWindow () {

  const windowStateKeeper = require('electron-window-state');

  let mainWindowState = windowStateKeeper({
    defaultWidth: 1024,
    defaultHeight: 600
  });
  // Create the browser window.
  let win = new BrowserWindow({
    devTools: true,
    show: false,
    backgroundColor: "#888",
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    titleBarStyle: "hiddenInset",
    frame: false,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      enableRemoteModule: true,
      contextIsolation: false,
      nodeIntegration: true,
      spellcheck: false
    }
  })

  mainWindowState.manage(win);

  win.once('ready-to-show', () => {
    win.show()
  })

  // and load the index.html of the app.
  win.loadFile('sage.html')
}

ipcMain.handle('read-ini-config', async (event, filePath) => {
  const fileContents = fs.readFileSync(filePath, 'utf-8');
  return ini.parse(fileContents);
});

ipcMain.handle('write-ini-config', async (event, filePath, newConfig) => {
  fs.writeFileSync(filePath, ini.stringify(newConfig), 'utf-8');
});

ipcMain.handle('show-dialog', async (event, options) => {
  return await dialog.showOpenDialog(options);
});

ipcMain.handle('read-setting', async (event, settingName) => {
  return await store.get(settingName);
});

ipcMain.on('write-setting', (event, settingName, settingValue) => {
  store.set(settingName, settingValue);
});

app.whenReady().then(createWindow)
