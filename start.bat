@echo off
title TypingGlyph Dev Server
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting TypingGlyph...
call npm run dev -- --open
pause
