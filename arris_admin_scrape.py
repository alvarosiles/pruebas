"""
Extrae datos reales del panel admin autenticado del ARRIS (192.168.60.1):
- Lista de clientes DHCP (IP, hostname, MAC, tipo de conexión)
- SSID y Pre-Shared Key reales de las redes 2.4GHz y 5GHz

Usa Playwright porque la SPA firma sus peticiones CGI con un nonce que solo
genera su propio JS (ver reboot_arris.py). Pensado para ejecutarse cada
cierto tiempo y volcar el resultado a arris_clients.json, que server.py sirve.

Uso:
    python arris_admin_scrape.py
"""

import json
import re
import sys
from playwright.sync_api import sync_playwright

HOST = "192.168.60.1"
USER = "admin"
PASSWORD = "alvaro"
OUT_FILE = "arris_clients.json"


def login(page):
    page.goto(f"http://{HOST}/", wait_until="networkidle")
    page.fill("#UserName", USER)
    page.fill("#Password", PASSWORD)
    page.keyboard.press("Enter")
    page.wait_for_load_state("networkidle")
    for _ in range(6):
        page.wait_for_timeout(3000)
        if not page.locator("#loading-dialog").is_visible():
            break
    if not page.evaluate("typeof isLoggedIn === 'function' && !!isLoggedIn()"):
        raise SystemExit("Login falló: revisa usuario/contraseña en arris_admin_scrape.py")


def scrape_clients(page):
    page.click("a:text-is('LAN')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    page.click("a:has-text('Lista de clientes')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2500)

    rows = page.eval_on_selector_all(
        "table tr",
        "els => els.map(e => [...e.querySelectorAll('td')].map(td => td.innerText.trim()))",
    )

    clients = []
    for r in rows:
        if len(r) == 6 and re.match(r"^\d+\.\d+\.\d+\.\d+$", r[0]):
            ip, name, mac, conn_type, expires, _ = r
            clients.append({
                "ip": ip, "hostname": name, "mac": mac,
                "connection": conn_type, "lease_expires": expires,
            })
    return clients


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-software-rasterizer"],
        )
        page = browser.new_page()
        print("1) Iniciando sesión...")
        login(page)
        print("   Login OK.")

        print("2) Extrayendo lista de clientes...")
        clients = scrape_clients(page)
        print(f"   {len(clients)} clientes encontrados.")

        result = {"ok": True, "clients": clients}

        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"3) Guardado en {OUT_FILE}")

        browser.close()


if __name__ == "__main__":
    main()
