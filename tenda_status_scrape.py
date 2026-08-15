"""
Extrae datos reales del panel admin del TENDA (192.168.3.1) vía su API interna
goform/getStatus (SSID, WiFi pass, dispositivos online, velocidad, firmware, uptime).

El login es solo con contraseña (hash MD5 armado por JS del propio router), así
que se usa Playwright para loguear y luego golpear la API ya autenticada por
cookie. Vuelca el resultado a tenda_status.json, que server.py sirve.

Uso:
    python tenda_status_scrape.py
"""

import json
from playwright.sync_api import sync_playwright

HOST = "192.168.3.1"
PASSWORD = "alvaro"
OUT_FILE = "tenda_status.json"
MODULES = "internetStatus,deviceStatistics,systemInfo,wanAdvCfg,wifiRelay,wifiBasicCfg,sysTime"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-software-rasterizer"],
        )
        page = browser.new_page()
        print("1) Iniciando sesión...")
        page.goto(f"http://{HOST}/", wait_until="networkidle")
        page.fill("#login-password", PASSWORD)
        page.click("#save")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        if "index.html" not in page.url:
            raise SystemExit("Login falló: revisa la contraseña en tenda_status_scrape.py")

        print("2) Leyendo goform/getStatus...")
        raw = page.evaluate(f"""async () => {{
            const res = await fetch('/goform/getStatus?modules={MODULES}', {{credentials:'include'}});
            return await res.text();
        }}""")
        data = json.loads(raw)
        browser.close()

    ds = data.get("deviceStastics", {})
    si = data.get("systemInfo", {})
    wf = data.get("wifiBasicCfg", {})
    st = data.get("sysTime", {})

    result = {
        "ok": True,
        "status": {
            "online_devices": ds.get("statusOnlineNumber"),
            "down_speed_mbps": ds.get("statusDownSpeed"),
            "up_speed_mbps": ds.get("statusUpSpeed"),
            "router_name": ds.get("routerName"),
            "wan_mac": si.get("statusWanMAC"),
            "lan_ip": si.get("lanIP"),
            "wan_ip": si.get("statusWanIP"),
            "wan_gateway": si.get("statusWanGaterway"),
            "dns1": si.get("statusWanDns1"),
            "dns2": si.get("statusWanDns2"),
            "firmware": si.get("softVersion"),
            "wan_connect_seconds": si.get("wanConnectTime"),
            "ssid_24": wf.get("wifiSSID"),
            "ssid_5g": wf.get("wifiSSID_5G"),
            "wifi_password": wf.get("wifiPwd"),
            "wifi_security": wf.get("wifiSecurityMode"),
            "system_time": st.get("sysTimecurrentTime"),
        },
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"3) Guardado en {OUT_FILE}")


if __name__ == "__main__":
    main()
