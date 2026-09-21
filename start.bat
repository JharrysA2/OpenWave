@echo off
setlocal
title SoundWave
cd /d "%~dp0"

echo.
echo  ================================================
echo   SoundWave - Iniciando...
echo  ================================================
echo.

:: Verificar que el venv existe (si no, crearlo e instalar dependencias)

:: Elegir el interprete de Python que si este en el PATH de cmd (py o python)
set "PY_CMD=python"
py -3 -c "pass" >nul 2>&1 && set "PY_CMD=py -3"

if not exist "venv\Scripts\python.exe" (
  echo  [!] Entorno virtual no encontrado.
  echo      Creando venv e instalando dependencias...
  echo.
  %PY_CMD% -m venv venv
  if errorlevel 1 goto :error
  "venv\Scripts\pip.exe" install -r backend\requirements.txt
  if errorlevel 1 goto :error
  echo.
)

:: Backend: solo abrimos una ventana si no hay ya uno respondiendo.
:: Si ya esta corriendo, saltamos el arranque (evita terminales duplicadas).
set "STARTED_BACKEND="
curl -s http://127.0.0.1:8765/health >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Backend ya esta corriendo en http://127.0.0.1:8765
  echo.
) else (
  echo  [1/2] Iniciando backend con Python...
  start "SoundWave Backend (Python)" /min cmd /k "cd /d ""%~dp0"" && call venv\Scripts\activate && cd backend && python main.py"
  set "STARTED_BACKEND=1"
  timeout /t 5 /nobreak >nul
  curl -s http://127.0.0.1:8765/health >nul 2>&1
  if errorlevel 1 (
    echo  [!] Advertencia: El backend no respondio en http://127.0.0.1:8765
    echo.
  ) else (
    echo  [OK] Backend corriendo en http://127.0.0.1:8765
    echo.
  )
)

:: Iniciar la app Tauri
echo  [2/2] Iniciando app Tauri...
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

npm run tauri dev
if errorlevel 1 (
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

:: Al cerrar la app, apagar el backend SOLO si lo arrancamos en esta ejecucion
if defined STARTED_BACKEND (
  echo.
  echo  Cerrando backend...
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
)
exit /b 0

:error
echo.
echo  [!] Fallo durante la inicializacion.
echo      Revisa los mensajes anteriores y vuelve a intentarlo.
pause
exit /b 1