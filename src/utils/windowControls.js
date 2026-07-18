import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

let _appWindow = null;

const getWin = () => {
  if (!_appWindow) {
    try {
      _appWindow = getCurrentWebviewWindow();
    } catch {}
  }
  return _appWindow;
};

export const winCtrl = {
  minimize: () => {
    try {
      getWin()?.minimize();
    } catch {}
  },
  maximize: () => {
    try {
      getWin()?.toggleMaximize();
    } catch {}
  },
  close: () => {
    try {
      getWin()?.close();
    } catch {}
  },
};
