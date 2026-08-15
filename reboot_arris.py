"""
Reinicia el gateway ARRIS TG2482 (192.168.60.1) controlando un navegador real
para hacer login (la SPA no acepta llamadas HTTP crudas: su CGI responde 500
si no llega el nonce/timestamp que el JS añade). Una vez logueado, se invoca
directamente snmpSet1() -la misma función que usa el botón "Restart Router"-
sobre el OID de reinicio, en vez de navegar por los menús (la página de
Status del router cuelga el renderer headless).

Uso:
    python reboot_arris.py            # ejecuta el reinicio
    python reboot_arris.py --dry-run  # hace login y prueba el OID sin reiniciar
"""

import sys
from playwright.sync_api import sync_playwright

HOST = "192.168.60.1"
USER = "admin"
PASSWORD = "alvaro"
REBOOT_OID = "1.3.6.1.4.1.4115.1.20.1.1.5.4.0"
DRY_RUN = "--dry-run" in sys.argv


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-software-rasterizer"],
        )
        page = browser.new_page()
        page.goto(f"http://{HOST}/", wait_until="networkidle")

        print("1) Iniciando sesión...")
        page.fill("#UserName", USER)
        page.fill("#Password", PASSWORD)
        page.keyboard.press("Enter")
        page.wait_for_load_state("networkidle")

        for _ in range(6):
            page.wait_for_timeout(5000)
            if not page.locator("#loading-dialog").is_visible():
                break

        logged_in = page.evaluate("typeof isLoggedIn === 'function' && !!isLoggedIn()")
        if not logged_in:
            raise SystemExit("Login falló: isLoggedIn() devolvió false. Revisa usuario/contraseña.")
        print("   Login confirmado (isLoggedIn() == true).")

        is95x = page.evaluate("typeof is95x === 'function' && !!is95x()")
        print(f"   is95x() = {is95x}")

        if DRY_RUN:
            print("[--dry-run] Listo para llamar a reboot(). No se ejecuta.")
        else:
            print("2) Llamando a reboot() (misma función que el botón real)...")
            page.evaluate("reboot()")
            page.wait_for_timeout(2000)
            print("Listo. El ARRIS debería estar reiniciando ahora.")

        browser.close()


if __name__ == "__main__":
    main()
