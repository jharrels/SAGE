const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
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
    resizable: true,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      spellcheck: false
    }
  })

  mainWindowState.manage(win);

  win.once('ready-to-show', () => { 
    nativeTheme.themeSource = 'dark';
    win.show();
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

ipcMain.on("window-action", (event, action) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;

  if (action === "minimize") win.minimize();
  else if (action === "maximize") win.isMaximized() ? win.restore() : win.maximize();
  else if (action === "close") win.close();
});

app.whenReady().then(createWindow)
