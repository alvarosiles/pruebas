"""
Extrae datos reales del panel admin del TP-Link TL-WR941HP (192.168.60.21):
firmware, MAC, IP, SSID, canal WiFi, tráfico y uptime.

Este firmware asigna una carpeta de sesión aleatoria tras el login (no basic
auth real pese al header WWW-Authenticate), así que se usa Playwright igual
que con el ARRIS. Vuelca el resultado a tplink_status.json, que server.py sirve.

Uso:
    python tplink_status_scrape.py
"""

import json
import re
from playwright.sync_api import sync_playwright

HOST = "192.168.60.21"
USER = "admin"
PASSWORD = "alvaro"
OUT_FILE = "tplink_status.json"


def parse_status(text):
    def field(label):
        m = re.search(re.escape(label) + r"[\s:]*\t?\s*\n?\s*([^\n]+)", text)
        return m.group(1).strip() if m else None

    bytes_m = re.search(r"Bytes:\s*([\d,]+)\s+([\d,]+)", text)
    packets_m = re.search(r"Paquetes:\s*([\d,]+)\s+([\d,]+)", text)

    return {
        "firmware": field("Versión del Firmware:"),
        "hardware": field("Versión del Hardware :"),
        "mac": field("Dirección MAC:"),
        "ip": field("Dirección IP:"),
        "subnet_mask": field("Mascara de Subred:"),
        "ssid": field("Nombre (SSID):"),
        "channel": field("Canal:"),
        "wifi_mode": field("Modo:"),
        "channel_width": field("Ancho de Canal:"),
        "rx_bytes": int(bytes_m.group(1).replace(",", "")) if bytes_m else None,
        "tx_bytes": int(bytes_m.group(2).replace(",", "")) if bytes_m else None,
        "rx_packets": int(packets_m.group(1).replace(",", "")) if packets_m else None,
        "tx_packets": int(packets_m.group(2).replace(",", "")) if packets_m else None,
        "uptime": field("Tiempo de Actividad del Sistema:"),
    }


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-software-rasterizer"],
        )
        page = browser.new_page()
        print("1) Iniciando sesión...")
        page.goto(f"http://{HOST}/", wait_until="networkidle")
        page.fill("#userName", USER)
        page.fill("#pcPassword", PASSWORD)
        page.keyboard.press("Enter")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        status_frame = next((f for f in page.frames if "StatusRpm.htm" in f.url), None)
        if not status_frame:
            raise SystemExit("No se encontró el frame de estado. ¿Login falló? Revisa usuario/contraseña.")

        print("2) Leyendo página de Estado...")
        text = status_frame.inner_text("body")
        status = parse_status(text)
        result = {"ok": True, "status": status}

        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"3) Guardado en {OUT_FILE}: {status}")

        browser.close()


if __name__ == "__main__":
    main()
