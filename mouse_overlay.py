import sys
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QApplication, QWidget

app = QApplication(sys.argv)

w = QWidget()

w.setWindowFlags(
    Qt.WindowType.FramelessWindowHint
    | Qt.WindowType.WindowStaysOnTopHint
    | Qt.WindowType.Tool
)

w.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
w.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

w.resize(400, 400)
w.show()

sys.exit(app.exec())