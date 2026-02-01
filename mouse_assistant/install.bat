@echo off
echo ========================================
echo Mouse Assistant - Instalacja
echo ========================================
echo.

echo Sprawdzanie Pythona...
python --version
if errorlevel 1 (
    echo BŁĄD: Python nie jest zainstalowany!
    echo Pobierz Pythona z: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo.
echo Instalacja zależności...
echo.

pip install --upgrade pip
pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo UWAGA: Wystąpił problem z instalacją PyAudio
    echo Próba alternatywnej instalacji...
    pip install pipwin
    pipwin install pyaudio
)

echo.
echo ========================================
echo Instalacja zakończona!
echo ========================================
echo.
echo Aby uruchomić aplikację, użyj:
echo python mouse_assistant.py
echo.
pause
