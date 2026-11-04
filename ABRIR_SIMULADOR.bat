@echo off
title Onde Estou? - servidor local (feche esta janela para encerrar)
cd /d "%~dp0"
echo.
echo  Abrindo o simulador em http://localhost:8080/simulador.html
echo  RA com a webcam do PC:   http://localhost:8080/index.html
echo.
echo  Para encerrar, feche esta janela.
echo.
start "" "http://localhost:8080/simulador.html"
python -m http.server 8080 --bind 127.0.0.1
