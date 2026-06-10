#!/usr/bin/env python3
"""Minimal SIP REGISTER + INVITE client for Stage 7 live proof."""
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import socket
import sys
import time
import uuid


def md5(value: str) -> str:
    return hashlib.md5(value.encode()).hexdigest()


def parse_www_auth(header: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in re.findall(r'(\w+)=(?:"([^"]*)"|([^,]*))', header):
        key, quoted, plain = part
        out[key] = quoted or plain
    return out


def build_auth(method: str, uri: str, username: str, password: str, challenge: dict[str, str], nc: str = "00000001") -> str:
    realm = challenge.get("realm", "asterisk")
    nonce = challenge["nonce"]
    opaque = challenge.get("opaque", "")
    qop = challenge.get("qop", "auth")
    cnonce = md5(str(random.random()))[:16]
    ha1 = md5(f"{username}:{realm}:{password}")
    ha2 = md5(f"{method}:{uri}")
    response = md5(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}")
    parts = [
        f'Digest username="{username}"',
        f'realm="{realm}"',
        f'nonce="{nonce}"',
        f'uri="{uri}"',
        f'response="{response}"',
        "algorithm=MD5",
        f'cnonce="{cnonce}"',
        f"nc={nc}",
        f"qop={qop}",
    ]
    if opaque:
        parts.append(f'opaque="{opaque}"')
    return ", ".join(parts)


def send_udp(host: str, port: int, local_ip: str, message: str) -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((local_ip, 0))
    try:
        sock.sendto(message.encode(), (host, port))
        sock.settimeout(3)
        data, _ = sock.recvfrom(65535)
        return data.decode(errors="replace")
    finally:
        sock.close()


def sip_request(
    host: str,
    port: int,
    username: str,
    password: str,
    local_ip: str,
    method: str,
    request_uri: str,
    to_user: str,
    body: str = "",
) -> str:
    call_id = f"{uuid.uuid4()}@{local_ip}"
    branch = f"z9hG4bK{uuid.uuid4().hex[:8]}"
    from_tag = uuid.uuid4().hex[:8]
    cseq = 1

    def build_message(auth_header: str | None = None, cseq_num: int = 1) -> str:
        headers = [
            f"{method} {request_uri} SIP/2.0",
            f"Via: SIP/2.0/UDP {local_ip}:5060;branch={branch};rport",
            f"From: <sip:{username}@{host}>;tag={from_tag}",
            f"To: <sip:{to_user}@{host}>",
            f"Call-ID: {call_id}",
            f"CSeq: {cseq_num} {method}",
            f"Contact: <sip:{username}@{local_ip}:5060>",
            "Max-Forwards: 70",
        ]
        if auth_header:
            headers.append(f"Authorization: {auth_header}")
        if method == "INVITE":
            headers.extend(["Content-Type: application/sdp", f"Content-Length: {len(body)}"])
        else:
            headers.append("Content-Length: 0")
        return "\r\n".join(headers) + "\r\n\r\n" + body

    resp = send_udp(host, port, local_ip, build_message())
    if "401" in resp.split("\r\n", 1)[0]:
        auth_line = next((l for l in resp.split("\r\n") if l.lower().startswith("www-authenticate:")), "")
        challenge = parse_www_auth(auth_line.split(":", 1)[1].strip())
        auth = build_auth(method, request_uri, username, password, challenge)
        resp = send_udp(host, port, local_ip, build_message(auth, cseq + 1))
    return resp


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    secrets = json.load(open(os.path.join(root, ".stage7-provision.secrets.json")))
    host = os.environ.get("SIP_HOST", "127.0.0.1")
    port = int(os.environ.get("SIP_PORT", "5062"))
    u1, p1 = secrets["sip1"]["u"], secrets["sip1"]["p"]
    u2, p2 = secrets["sip2"]["u"], secrets["sip2"]["p"]
    local_ip = host

    # Restore tenant include for real test
    reg_resp = sip_request(host, port, u2, p2, local_ip, "REGISTER", f"sip:{u2}@{host}:{port}", u2)
    if "200 OK" not in reg_resp:
        print("REGISTER 1002 failed:", reg_resp[:500])
        return 1

    sdp = (
        "v=0\r\n"
        f"o=- {int(time.time())} 0 IN IP4 {local_ip}\r\n"
        "s=stage7\r\n"
        f"c=IN IP4 {local_ip}\r\n"
        "t=0 0\r\n"
        "m=audio 6010 RTP/AVP 0\r\n"
        "a=rtpmap:0 PCMU/8000\r\n"
    )
    invite_resp = sip_request(
        host,
        port,
        u1,
        p1,
        local_ip,
        "INVITE",
        f"sip:1002@{host}:{port}",
        "1002",
        sdp,
    )
    if "200 OK" not in invite_resp and "180 Ringing" not in invite_resp:
        print("INVITE failed:", invite_resp[:800])
        return 1

    print("STAGE7_PYTHON_SIP: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
