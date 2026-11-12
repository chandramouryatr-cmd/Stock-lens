@echo off
rem Starts Stock Lens so a phone on the same Wi-Fi can open it.
rem The address for the phone is printed below. Keep this window open while you use it.
cd /d "%~dp0"
python run.py --lan --open
pause
