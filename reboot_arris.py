"""
Reinicia el gateway ARRIS TG2482 (192.168.60.1) controlando un navegador real,
porque la interfaz web del router es una SPA con login/estado manejado en JS
y su CGI rechaza (con 500) cualquier llamada directa que no reproduzca ese
protocolo exactamente. Usar un navegador evita tener que reimplementarlo.

Uso:
    python reboot_arris.py            # ejecuta el reinicio
    python reboot_arris.py --dry-run  # hace login y llega hasta el botón, sin pulsarlo
"""

import sys
from playwright.sync_api import sync_playwright

HOST = "192.168.60.1"
USER = "admin"
PASSWORD = "alvaro"
DRY_RUN = "--dry-run" in sys.argv


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"http://{HOST}/", wait_until="networkidle")

        print("1) Iniciando sesión...")
        page.fill("#UserName", USER)
        page.fill("#Password", PASSWORD)
        page.keyboard.press("Enter")
        page.wait_for_load_state("networkidle")

        page.wait_for_timeout(2000)
        page.screenshot(path="after_login.png")
        print("Links visibles:", page.locator("a").all_inner_texts())
        return

        if DRY_RUN:
            print("[--dry-run] Login OK, botón de reinicio encontrado. No se pulsa.")
        else:
            print("3) Pulsando Restart...")
            restart_button.click()
            page.wait_for_timeout(3000)
            print("Listo. El ARRIS debería estar reiniciando ahora.")

        browser.close()


if __name__ == "__main__":
    main()
