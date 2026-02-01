@echo off
echo ========================================
echo Mouse Assistant - Uruchomienie jako Administrator
echo ========================================
echo.
echo UWAGA: Ta aplikacja wymaga uprawnien administratora
echo aby przechwytywac globalne eventy myszy i klawiatury.
echo.
echo Kliknij PRAWYM przyciskiem na ten plik i wybierz
echo "Uruchom jako administrator"
echo.
pause

cd /d "%~dp0"
python mouse_assistant_simple.py
pause
