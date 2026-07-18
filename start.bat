@echo off
title SoundWave
echo.
echo  ================================================
echo   SoundWave - Iniciando...
echo  ================================================
echo.

:: Verificar que el venv existe
if not exist "venv\Scripts\python.exe" (
  echo  [!] Entorno virtual no encontrado.
  echo      Creando venv e instalando dependencias...
  echo.
  python -m venv venv
  venv\Scripts\pip install -r backend\requirements.txt
  echo.
)

:: Iniciar backend Python usando el entorno virtual (VENV)
echo  [1/2] Iniciando backend con Python...
start "SoundWave Backend" /min cmd /k "cd /d %~dp0 && call venv\Scripts\activate && cd backend && python main.py"

:: Esperar 4 segundos para que el backend arranque bien
timeout /t 4 /nobreak >nul

:: Verificar que el backend esta corriendo (puerto 8765)
curl -s http://127.0.0.1:8765/openapi.json >nul 2>&1
if %errorlevel% neq 0 (
  echo  [!] Advertencia: El backend puede no haber iniciado correctamente.
  echo.
) else (
  echo  [OK] Backend corriendo en http://127.0.0.1:8765
  echo.
)

:: Iniciar la app Tauri
echo  [2/2] Iniciando app Tauri...
cd /d %~dp0

:: Agregar cargo al PATH si no esta (necesario para Tauri/Rust)
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

npm run tauri dev

:: Si npm run tauri dev falla, mostrar error y pausar
if %errorlevel% neq 0 (
  echo.
  echo  ================================================
  echo   ERROR: La app se cerro inesperadamente.
  echo   Codigo de error: %errorlevel%
  echo  ================================================
  echo.
  echo  Posibles causas:
  echo   - Tauri no esta instalado: npm install -g @tauri-apps/cli
  echo   - Faltan dependencias: npm install
  echo   - Rust no esta instalado: https://rustup.rs
  echo.
  pause
)

:: Al cerrar la app, matar el backend
echo.
echo  Cerrando backend...
taskkill /f /fi "WINDOWTITLE eq SoundWave Backend" >nul 2>&1
