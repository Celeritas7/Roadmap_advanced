@echo off
title Roadmap local dev server
REM Double-click to run the Roadmap app locally (Vite dev server).
REM Put this .bat in the Roadmap_advanced folder (next to package.json).
REM Leave this window open while testing.
cd /d "%~dp0"

if not exist "package.json" (
  echo Could not find package.json here.
  echo Put this .bat in the Roadmap_advanced folder, next to package.json.
  echo Current folder: %CD%
  pause & goto :eof
)

REM --- Find Node/npm: PATH first, then common install locations ---
REM (double-clicking uses plain cmd, where nvm/volta PATH tweaks may not be
REM  active, so we look for npm.cmd directly.)
set "NPM="
for %%P in (
  "npm.cmd"
  "%ProgramFiles%\nodejs\npm.cmd"
  "%ProgramFiles(x86)%\nodejs\npm.cmd"
  "%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
  "%APPDATA%\nvm\npm.cmd"
) do (
  if not defined NPM (
    call "%%~P" --version >nul 2>nul && set "NPM=%%~P"
  )
)

if not defined NPM (
  echo.
  echo Could not find Node.js / npm automatically.
  echo Install Node from https://nodejs.org, then double-click this again.
  echo Or open a terminal, cd to this folder, and run:
  echo     npm install ^&^& npm run dev
  echo.
  pause & goto :eof
)

REM --- First run: install dependencies ---
if not exist "node_modules" (
  echo Installing dependencies - first run only, takes a minute...
  call "%NPM%" install
  if errorlevel 1 (
    echo.
    echo npm install failed - see errors above.
    pause & goto :eof
  )
)

if not exist ".env.local" (
  echo.
  echo WARNING: no .env.local found - Supabase keys missing.
  echo Copy .env.example to .env.local and fill in your keys, or the app
  echo will fail to load data.
  echo.
)

echo.
echo   Roadmap - local dev server
echo   npm:     %NPM%
echo   Open:    http://localhost:5173/
echo   (Close this window to stop.)
echo.

start "" "http://localhost:5173/"
call "%NPM%" run dev

echo.
echo Server stopped.
pause
