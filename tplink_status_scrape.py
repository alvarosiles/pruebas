"""
Extrae datos reales del panel admin de cada TP-Link TL-WR941HP en la red
(firmware, MAC, IP, SSID, canal WiFi, tráfico y uptime).

Este firmware asigna una carpeta de sesión aleatoria tras el login (no basic
auth real pese al header WWW-Authenticate), así que se usa Playwright igual
que con el ARRIS. Vuelca el resultado a tplink_status.json (lista), que
server.py sirve.

Uso:
    python tplink_status_scrape.py
"""

import json
import re
from playwright.sync_api import sync_playwright

USER = "admin"
PASSWORD = "alvaro"
OUT_FILE = "tplink_status.json"

# Cada AP TP-Link conocido en la red (mismo usuario/contraseña).
HOSTS = [
    "192.168.60.21",  # SSID Azul3
    "192.168.60.37",  # SSID Azul2
]


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


def scrape_host(browser, host):
    page = browser.new_page()
    try:
        page.goto(f"http://{host}/", wait_until="networkidle")
        page.fill("#userName", USER)
        page.fill("#pcPassword", PASSWORD)
        page.keyboard.press("Enter")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        status_frame = next((f for f in page.frames if "StatusRpm.htm" in f.url), None)
        if not status_frame:
            return {"ok": False, "host": host, "error": "login falló o no se encontró el frame de estado"}

        text = status_frame.inner_text("body")
        return {"ok": True, "host": host, "status": parse_status(text)}
    finally:
        page.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-software-rasterizer"],
        )
        results = []
        for host in HOSTS:
            print(f"Leyendo {host}...")
            r = scrape_host(browser, host)
            print(f"   {r}")
            results.append(r)
        browser.close()

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"ok": True, "devices": results}, f, ensure_ascii=False, indent=2)
    print(f"Guardado en {OUT_FILE}")


if __name__ == "__main__":
    main()
