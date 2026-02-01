"""
Mouse Assistant - Aplikacja do zarządzania komputerem za pomocą myszki
z funkcjami transkrypcji mowy, kopiuj/wklej i kołowym menu.
"""

import sys
import threading
import math
from PyQt5.QtWidgets import (QApplication, QWidget, QMainWindow, QSystemTrayIcon,
                              QMenu, QLabel, QPushButton, QVBoxLayout)
from PyQt5.QtCore import Qt, QPoint, QTimer, pyqtSignal, QObject
from PyQt5.QtGui import QPainter, QColor, QPen, QFont, QIcon, QPixmap
from pynput import mouse, keyboard as pynput_keyboard
import pyautogui
import keyboard
import speech_recognition as sr
import win32gui
import win32con
import time


class GlobalState(QObject):
    """Klasa do przechowywania globalnego stanu aplikacji"""
    transcription_changed = pyqtSignal(bool)

    def __init__(self):
        super().__init__()
        self.transcribing = False
        self.both_buttons_pressed = False
        self.left_pressed = False
        self.right_pressed = False
        self.menu_position = None


class RadialMenu(QWidget):
    """Kołowe menu wyświetlane po kliknięciu obu przycisków myszy"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(300, 300)

        self.menu_items = [
            {"name": "Kopiuj", "action": self.copy_action},
            {"name": "Wklej", "action": self.paste_action},
            {"name": "Transkrypcja ON/OFF", "action": self.toggle_transcription},
            {"name": "Zamknij", "action": self.close_menu},
        ]

        self.selected_item = -1
        self.center = QPoint(150, 150)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        # Rysuj tło
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(40, 40, 40, 200))
        painter.drawEllipse(self.center, 140, 140)

        # Rysuj centralny okrąg
        painter.setBrush(QColor(60, 60, 60, 220))
        painter.drawEllipse(self.center, 40, 40)

        # Rysuj elementy menu
        angle_step = 360 / len(self.menu_items)
        for i, item in enumerate(self.menu_items):
            angle = math.radians(i * angle_step - 90)  # -90 żeby zacząć od góry

            # Pozycja tekstu
            radius = 100
            x = self.center.x() + radius * math.cos(angle)
            y = self.center.y() + radius * math.sin(angle)

            # Podświetlenie wybranego elementu
            if i == self.selected_item:
                painter.setPen(Qt.NoPen)
                painter.setBrush(QColor(100, 150, 255, 150))
                painter.drawEllipse(QPoint(int(x), int(y)), 50, 50)

            # Tekst
            painter.setPen(QPen(QColor(255, 255, 255), 2))
            painter.setFont(QFont("Arial", 10, QFont.Bold))
            text_rect = painter.fontMetrics().boundingRect(item["name"])
            painter.drawText(int(x - text_rect.width() / 2),
                           int(y + text_rect.height() / 4),
                           item["name"])

    def mouseMoveEvent(self, event):
        """Wykrywanie nad którym elementem jest kursor"""
        pos = event.pos()
        dx = pos.x() - self.center.x()
        dy = pos.y() - self.center.y()
        distance = math.sqrt(dx * dx + dy * dy)

        if distance > 50 and distance < 140:
            angle = math.degrees(math.atan2(dy, dx)) + 90
            if angle < 0:
                angle += 360

            angle_step = 360 / len(self.menu_items)
            self.selected_item = int(angle / angle_step)
            self.update()
        else:
            self.selected_item = -1
            self.update()

    def mouseReleaseEvent(self, event):
        """Wykonaj akcję po puszczeniu przycisku"""
        if self.selected_item >= 0:
            self.menu_items[self.selected_item]["action"]()
        self.close()

    def copy_action(self):
        keyboard.press_and_release('ctrl+c')

    def paste_action(self):
        keyboard.press_and_release('ctrl+v')

    def toggle_transcription(self):
        if hasattr(self.parent(), 'global_state'):
            current = self.parent().global_state.transcribing
            self.parent().global_state.transcribing = not current
            self.parent().global_state.transcription_changed.emit(not current)

    def close_menu(self):
        self.close()


class TranscriptionWorker(QObject):
    """Wątek do obsługi transkrypcji mowy"""
    text_recognized = pyqtSignal(str)

    def __init__(self, global_state):
        super().__init__()
        self.global_state = global_state
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        self.running = False

    def start_listening(self):
        self.running = True
        threading.Thread(target=self._listen_loop, daemon=True).start()

    def stop_listening(self):
        self.running = False

    def _listen_loop(self):
        """Główna pętla nasłuchiwania"""
        with self.microphone as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.5)

        while self.running:
            if not self.global_state.transcribing:
                time.sleep(0.1)
                continue

            try:
                with self.microphone as source:
                    audio = self.recognizer.listen(source, timeout=1, phrase_time_limit=5)

                try:
                    text = self.recognizer.recognize_google(audio, language='pl-PL')
                    if text:
                        self.text_recognized.emit(text)
                except sr.UnknownValueError:
                    pass
                except sr.RequestError as e:
                    print(f"Błąd serwisu rozpoznawania: {e}")

            except Exception as e:
                print(f"Błąd podczas nagrywania: {e}")
                time.sleep(0.1)


class MouseController:
    """Kontroler obsługujący eventy myszy"""

    def __init__(self, main_window):
        self.main_window = main_window
        self.global_state = main_window.global_state
        self.scroll_keyboard_mode = False

    def on_click(self, x, y, button, pressed):
        """Obsługa kliknięć myszy"""
        if button == mouse.Button.left:
            self.global_state.left_pressed = pressed
        elif button == mouse.Button.right:
            self.global_state.right_pressed = pressed

        # Sprawdź czy oba przyciski są wciśnięte
        if self.global_state.left_pressed and self.global_state.right_pressed:
            if not self.global_state.both_buttons_pressed:
                self.global_state.both_buttons_pressed = True
                self.global_state.menu_position = (x, y)
                self.main_window.show_radial_menu.emit(x, y)
        else:
            self.global_state.both_buttons_pressed = False

        # Sprawdź czy kursor jest w polu tekstowym
        if pressed and button == mouse.Button.left:
            self.check_text_field()

        return True

    def on_scroll(self, x, y, dx, dy):
        """Obsługa scrolla - emulacja klawiatury"""
        if self.scroll_keyboard_mode:
            if dy > 0:
                keyboard.press_and_release('up')
            elif dy < 0:
                keyboard.press_and_release('down')
            return False  # Blokuj normalny scroll
        return True

    def check_text_field(self):
        """Sprawdź czy kursor jest nad polem tekstowym"""
        try:
            hwnd = win32gui.GetForegroundWindow()
            class_name = win32gui.GetClassName(hwnd)

            # Lista popularnych klas pól tekstowych
            text_field_classes = ['Edit', 'RichEdit', 'RichEdit20W',
                                'RICHEDIT50W', 'TextBox', 'Scintilla']

            # Sprawdź czy to pole tekstowe
            for field_class in text_field_classes:
                if field_class.lower() in class_name.lower():
                    self.global_state.transcribing = True
                    self.global_state.transcription_changed.emit(True)
                    return

        except Exception as e:
            print(f"Błąd sprawdzania pola tekstowego: {e}")


class MainWindow(QMainWindow):
    """Główne okno aplikacji"""
    show_radial_menu = pyqtSignal(int, int)

    def __init__(self):
        super().__init__()
        self.global_state = GlobalState()
        self.init_ui()
        self.setup_tray()
        self.setup_mouse_listener()
        self.setup_transcription()

        # Połącz sygnały
        self.show_radial_menu.connect(self.display_radial_menu)
        self.global_state.transcription_changed.connect(self.on_transcription_changed)

    def init_ui(self):
        """Inicjalizacja interfejsu użytkownika"""
        self.setWindowTitle("Mouse Assistant")
        self.setGeometry(100, 100, 400, 300)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        # Status
        self.status_label = QLabel("Status: Aktywny")
        self.status_label.setStyleSheet("font-size: 14px; font-weight: bold;")
        layout.addWidget(self.status_label)

        # Info o transkrypcji
        self.transcription_label = QLabel("Transkrypcja: Wyłączona")
        self.transcription_label.setStyleSheet("font-size: 12px;")
        layout.addWidget(self.transcription_label)

        # Przycisk minimalizacji
        minimize_btn = QPushButton("Minimalizuj do zasobnika")
        minimize_btn.clicked.connect(self.hide)
        layout.addWidget(minimize_btn)

        # Instrukcje
        instructions = QLabel(
            "Instrukcje:\n"
            "• Kliknij w pole tekstowe aby włączyć transkrypcję\n"
            "• Kliknij obydwa przyciski myszy aby otworzyć menu\n"
            "• Scroll myszy = strzałki góra/dół (w trybie klawiatury)"
        )
        instructions.setWordWrap(True)
        instructions.setStyleSheet("font-size: 10px; padding: 10px;")
        layout.addWidget(instructions)

        layout.addStretch()

    def setup_tray(self):
        """Konfiguracja ikony w zasobniku systemowym"""
        self.tray_icon = QSystemTrayIcon(self)

        # Stwórz prostą ikonę
        pixmap = QPixmap(64, 64)
        pixmap.fill(QColor(100, 150, 255))
        self.tray_icon.setIcon(QIcon(pixmap))

        # Menu
        tray_menu = QMenu()
        show_action = tray_menu.addAction("Pokaż")
        show_action.triggered.connect(self.show)
        quit_action = tray_menu.addAction("Zakończ")
        quit_action.triggered.connect(QApplication.quit)

        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()

    def setup_mouse_listener(self):
        """Uruchom nasłuchiwanie myszy"""
        self.mouse_controller = MouseController(self)
        self.mouse_listener = mouse.Listener(
            on_click=self.mouse_controller.on_click,
            on_scroll=self.mouse_controller.on_scroll
        )
        self.mouse_listener.start()

    def setup_transcription(self):
        """Uruchom moduł transkrypcji"""
        self.transcription_worker = TranscriptionWorker(self.global_state)
        self.transcription_worker.text_recognized.connect(self.on_text_recognized)
        self.transcription_worker.start_listening()

    def display_radial_menu(self, x, y):
        """Wyświetl kołowe menu"""
        self.radial_menu = RadialMenu(self)
        self.radial_menu.move(x - 150, y - 150)
        self.radial_menu.show()

    def on_text_recognized(self, text):
        """Wpisz rozpoznany tekst"""
        keyboard.write(text + " ")

    def on_transcription_changed(self, enabled):
        """Aktualizuj status transkrypcji"""
        status = "Włączona" if enabled else "Wyłączona"
        self.transcription_label.setText(f"Transkrypcja: {status}")

    def closeEvent(self, event):
        """Minimalizuj do zasobnika zamiast zamykać"""
        event.ignore()
        self.hide()
        self.tray_icon.showMessage(
            "Mouse Assistant",
            "Aplikacja działa w tle",
            QSystemTrayIcon.Information,
            2000
        )


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    window = MainWindow()
    window.show()

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
