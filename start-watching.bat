@echo off
REM ============================================================
REM  Deez Plants - start the walk watcher
REM
REM  Double-click this. Leave the window open. Drop an exported
REM  walk into OneDrive\Deez Plants\walks from your phone and a
REM  transcript appears there a few minutes later.
REM
REM  This exists so starting the watcher is not a command to
REM  remember. Close the window (or Ctrl+C) to stop it.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Deez Plants - watching for walks
echo   --------------------------------
echo   Leave this window open.
echo   Close it when you are done.
echo.

python watch_walks.py "%USERPROFILE%\OneDrive\Deez Plants\walks"

REM If it stops for any reason, hold the window open so whatever
REM it printed can actually be read rather than vanishing.
echo.
echo   The watcher has stopped.
pause
