"""
Servidor local para network-dashboard.html.
Sirve los archivos estáticos del dashboard y expone /api/arris-status,
que hace de proxy hacia la interfaz "Touchstone" del cable modem ARRIS
(http://192.168.100.1/cgi-bin/*) -sin login, datos DOCSIS reales- y los
devuelve como JSON para que el navegador no choque con CORS.

Uso:
    python server.py
    -> abre http://localhost:8765/network-dashboard.html
"""

import json
import re
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler

MODEM_HOST = "192.168.100.1"
PORT = 8765


def fetch(path):
    url = f"http://{MODEM_HOST}/cgi-bin/{path}"
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.read().decode("iso-8859-1")


def parse_status(html):
    uptime_m = re.search(r"System Uptime:\s*</td><td>([^<]+)</td>", html)
    cm_status_m = re.search(r"CM Status:</td><td>([^<]+)</td>", html)
    computers_m = re.search(r"Computers Detected:</td><td>([^<]+)</td>", html)

    downstream_rows = re.findall(
        r"<tr><td>Downstream \d+</td><td>(\d+)</td><td>([\d.]+ MHz)</td>"
        r"<td>([\d.-]+ dBmV)</td><td>([\d.]+ dB)</td><td>(\w+)</td>"
        r"<td>(\d+)</td><td>(\d+)</td><td>(\d+)</td></tr>",
        html,
    )
    downstream = [
        {
            "dcid": d[0], "freq": d[1], "power": d[2], "snr": d[3],
            "modulation": d[4], "octets": d[5], "corrected": d[6], "uncorrectable": d[7],
        }
        for d in downstream_rows
    ]

    upstream_rows = re.findall(
        r"<tr><td>Upstream \d+</td><td>(\d+)</td><td>([\d.]+ MHz)</td>"
        r"<td>([\d.-]+ dBmV)</td><td>([^<]+)</td><td>([\d.]+ kSym/s)</td><td>(\w+)</td>",
        html,
    )
    upstream = [
        {"ucid": u[0], "freq": u[1], "power": u[2], "type": u[3], "symbol_rate": u[4], "modulation": u[5]}
        for u in upstream_rows
    ]

    iface_section_m = re.search(r"Interface Parameters.*?<table[^>]*>(.*?)</table>", html, re.DOTALL)
    interfaces = []
    if iface_section_m:
        row_blocks = re.findall(r"<tr>(.*?)</tr>", iface_section_m.group(1), re.DOTALL)
        for block in row_blocks:
            cells = [c.strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", block, re.DOTALL)]
            if len(cells) == 5 and cells[0] not in ("Interface Name",):
                interfaces.append(
                    {"name": cells[0], "provisioned": cells[1], "state": cells[2], "speed": cells[3], "mac": cells[4]}
                )

    def avg(values):
        nums = [float(v.split()[0]) for v in values]
        return round(sum(nums) / len(nums), 2) if nums else None

    return {
        "uptime": uptime_m.group(1).strip() if uptime_m else None,
        "cm_status": cm_status_m.group(1).strip() if cm_status_m else None,
        "computers_detected": computers_m.group(1).strip() if computers_m else None,
        "downstream_channels": len(downstream),
        "downstream_avg_power_dBmV": avg([d["power"] for d in downstream]),
        "downstream_avg_snr_dB": avg([d["snr"] for d in downstream]),
        "downstream": downstream,
        "upstream_channels": len(upstream),
        "upstream_avg_power_dBmV": avg([u["power"] for u in upstream]),
        "upstream": upstream,
        "interfaces": interfaces,
    }


def parse_vers(html):
    def find_br(label):
        m = re.search(re.escape(label) + r"\s*([^<]+)<(?:br|/td)", html)
        return m.group(1).strip() if m else None

    serial_m = re.search(r"Serial Number:</td>\s*<td>([^<]+)</td>", html)
    fw_name_m = re.search(r"Firmware Name:</td><td>([^<]+)</td>", html)
    fw_build_m = re.search(r"Firmware Build Time:\s*</td><td>([^<]+)</td>", html)

    return {
        "hw_rev": find_br("HW_REV:"),
        "vendor": find_br("VENDOR:"),
        "bootr": find_br("BOOTR:"),
        "sw_rev": find_br("SW_REV:"),
        "model": find_br("MODEL:"),
        "serial": serial_m.group(1).strip() if serial_m else None,
        "firmware_name": fw_name_m.group(1).strip() if fw_name_m else None,
        "firmware_build_time": fw_build_m.group(1).strip() if fw_build_m else None,
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/arris-status":
            try:
                status_html = fetch("status_cgi")
                vers_html = fetch("vers_cgi")
                data = {
                    "ok": True,
                    "status": parse_status(status_html),
                    "versions": parse_vers(vers_html),
                }
            except Exception as e:
                data = {"ok": False, "error": str(e)}
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == "__main__":
    print(f"Sirviendo en http://localhost:{PORT}/network-dashboard.html")
    HTTPServer(("localhost", PORT), Handler).serve_forever()
