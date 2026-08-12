#!/usr/bin/env python3
"""_cdp_loader.py
Uso: python3 _cdp_loader.py <puerto> <rutaExtension> [urlAAbrir]

Fallback en Python puro (sin "websockets"/"websocket-client") del loader de
Node. Ver _cdp_loader.js para la explicación de por qué se usa el DevTools
Protocol (Extensions.loadUnpacked) en vez de --load-extension.
"""

import base64
import hashlib
import http.client
import json
import os
import socket
import struct
import sys
import time
import urllib.request


def http_json(port, path):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        conn.request("GET", path)
        res = conn.getresponse()
        data = res.read().decode("utf-8", "replace")
    finally:
        conn.close()
    try:
        return json.loads(data)
    except ValueError:
        return data


def wait_for_debugger(port, max_attempts=40, delay=0.25):
    for _ in range(max_attempts):
        try:
            info = http_json(port, "/json/version")
            if isinstance(info, dict) and info.get("webSocketDebuggerUrl"):
                return info
        except Exception:
            pass
        time.sleep(delay)
    raise RuntimeError(
        f"No se pudo conectar a http://127.0.0.1:{port} "
        f"(¿Brave abrió con --remote-debugging-port={port}?)"
    )


# ---------------------------------------------------------------------
# Cliente WebSocket mínimo (handshake + framing RFC 6455), sin deps.
# ---------------------------------------------------------------------

class MiniWebSocket:
    def __init__(self, ws_url):
        # ws://127.0.0.1:PORT/devtools/browser/<id>
        rest = ws_url.split("://", 1)[1]
        hostport, _, path = rest.partition("/")
        path = "/" + path
        if ":" in hostport:
            host, port = hostport.split(":")
            port = int(port)
        else:
            host, port = hostport, 80

        self.sock = socket.create_connection((host, port), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        )
        self.sock.sendall(handshake.encode())
        self._recv_buf = b""
        self._read_until_headers_end()

    def _read_until_headers_end(self):
        while b"\r\n\r\n" not in self._recv_buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("Conexión cerrada durante el handshake de WebSocket")
            self._recv_buf += chunk
        head, _, rest = self._recv_buf.partition(b"\r\n\r\n")
        if b"101" not in head.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"Handshake de WebSocket falló: {head[:200]!r}")
        self._recv_buf = rest

    def send(self, obj):
        payload = json.dumps(obj).encode("utf-8")
        mask_key = os.urandom(4)
        masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

        length = len(payload)
        if length < 126:
            header = bytes([0x81, 0x80 | length])
        elif length < 65536:
            header = bytes([0x81, 0x80 | 126]) + struct.pack(">H", length)
        else:
            header = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", length)

        self.sock.sendall(header + mask_key + masked)

    def _recv_exact(self, n):
        while len(self._recv_buf) < n:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("Conexión de WebSocket cerrada inesperadamente")
            self._recv_buf += chunk
        data, self._recv_buf = self._recv_buf[:n], self._recv_buf[n:]
        return data

    def recv_json(self, timeout=15):
        self.sock.settimeout(timeout)
        fragments = []
        while True:
            head = self._recv_exact(2)
            fin = (head[0] & 0x80) != 0
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(8))[0]
            payload = self._recv_exact(length)

            if opcode == 0x8:  # close
                raise RuntimeError("El servidor cerró la conexión de WebSocket")
            if opcode in (0x1, 0x0):
                fragments.append(payload)
                if fin:
                    text = b"".join(fragments).decode("utf-8", "replace")
                    try:
                        return json.loads(text)
                    except ValueError:
                        fragments = []
                        continue
            # ping/pong ignorados: no hacen falta para este uso puntual

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def cdp_command(ws, msg_id, method, params, timeout=15):
    ws.send({"id": msg_id, "method": method, "params": params})
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = ws.recv_json(timeout=max(0.1, deadline - time.time()))
        if msg.get("id") == msg_id:
            if "error" in msg:
                raise RuntimeError(msg["error"].get("message", str(msg["error"])))
            return msg.get("result")
    raise RuntimeError(f'Timeout esperando respuesta de "{method}"')


def main():
    if len(sys.argv) < 3:
        print("Uso: python3 _cdp_loader.py <puerto> <rutaExtension> [urlAAbrir]", file=sys.stderr)
        return 1

    port = int(sys.argv[1])
    ext_path = sys.argv[2]
    url_to_open = sys.argv[3] if len(sys.argv) > 3 else None

    print("Esperando a que Brave abra el puerto de depuración...")
    info = wait_for_debugger(port)

    print("Conectando por DevTools Protocol...")
    ws = MiniWebSocket(info["webSocketDebuggerUrl"])
    try:
        print(f"Cargando extensión descomprimida: {ext_path}")
        result = cdp_command(ws, 1, "Extensions.loadUnpacked", {"path": ext_path})
        ext_id = (result or {}).get("id", "(desconocido)")
        print(f"Extensión cargada. ID: {ext_id}")

        if url_to_open:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/json/new?{url_to_open}", timeout=5).read()
            print(f"Pestaña abierta: {url_to_open}")
    finally:
        ws.close()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - loader de un solo uso, se reporta y se sale
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
