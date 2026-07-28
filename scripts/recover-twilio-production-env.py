#!/usr/bin/env python3
import base64
import json
import os
import re
import stat
import sys
import urllib.parse
import urllib.request
import urllib.error
from getpass import getpass

ENV_PATH = os.environ.get(
    "TWILIO_ENV_FILE",
    "/home/media/Downloads/pbx/.env.twilio.production.local",
)

REQUIRED_FOR_AUTH = ["TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET"]

def mask(value: str, keep: int = 4) -> str:
    if not value:
        return "<empty>"
    if len(value) <= keep:
        return "*" * len(value)
    return "*" * (len(value) - keep) + value[-keep:]

def is_account_sid(value: str) -> bool:
    return bool(re.fullmatch(r"AC[a-zA-Z0-9]{32}", value or ""))

def is_api_key_sid(value: str) -> bool:
    return bool(re.fullmatch(r"SK[a-zA-Z0-9]{32}", value or ""))

def is_trunk_sid(value: str) -> bool:
    return bool(re.fullmatch(r"TK[a-zA-Z0-9]{32}", value or ""))

def is_israeli_e164(value: str) -> bool:
    return bool(re.fullmatch(r"\+972\d{7,10}", value or ""))

def parse_env(path: str) -> dict:
    env = {}
    if not os.path.exists(path):
        raise SystemExit(f"ERROR: env file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env

def write_env(path: str, updates: dict):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    seen = set()
    new_lines = []

    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            new_lines.append(line)
            continue

        key = line.split("=", 1)[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}\n")
            seen.add(key)
        else:
            new_lines.append(line)

    for key, value in updates.items():
        if key not in seen:
            new_lines.append(f"{key}={value}\n")

    backup = f"{path}.before-recovery"
    if not os.path.exists(backup):
        with open(path, "r", encoding="utf-8") as src, open(backup, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        os.chmod(backup, 0o600)

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    os.chmod(path, 0o600)

def twilio_get(url: str, api_key_sid: str, api_key_secret: str) -> dict:
    token = base64.b64encode(f"{api_key_sid}:{api_key_secret}".encode()).decode()
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "User-Agent": "pbx-twilio-env-recovery/1.0",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
            msg = parsed.get("message") or parsed.get("detail") or body[:300]
        except Exception:
            msg = body[:300]
        raise RuntimeError(f"Twilio GET failed HTTP {e.code}: {msg}") from None
    except Exception as e:
        raise RuntimeError(f"Twilio GET failed: {e}") from None

def recover_account_sid(env: dict) -> str:
    existing = env.get("TWILIO_ACCOUNT_SID", "")
    if is_account_sid(existing):
        print(f"TWILIO_ACCOUNT_SID already set: {mask(existing)}")
        return existing

    api_key_sid = env.get("TWILIO_API_KEY_SID", "")
    api_key_secret = env.get("TWILIO_API_KEY_SECRET", "")
    trunk_sid = env.get("TWILIO_TRUNK_SID", "")

    # Best source: the trunk resource usually exposes account_sid and does not require AC in the URL.
    if is_trunk_sid(trunk_sid):
        print("Trying to recover Account SID from Twilio SIP Trunk resource...")
        try:
            trunk = twilio_get(
                f"https://trunking.twilio.com/v1/Trunks/{urllib.parse.quote(trunk_sid)}",
                api_key_sid,
                api_key_secret,
            )
            sid = trunk.get("account_sid", "")
            if is_account_sid(sid):
                print(f"Recovered TWILIO_ACCOUNT_SID from trunk: {mask(sid)}")
                return sid
            print("Trunk response did not include a valid account_sid.")
        except Exception as e:
            print(f"Trunk lookup did not recover Account SID: {e}")

    # Fallback: list accounts. This may require a Main API Key / sufficient permissions.
    print("Trying to recover Account SID from Accounts API...")
    try:
        data = twilio_get(
            "https://api.twilio.com/2010-04-01/Accounts.json",
            api_key_sid,
            api_key_secret,
        )
        accounts = data.get("accounts", [])
        valid = [a for a in accounts if is_account_sid(a.get("sid", ""))]
        if len(valid) == 1:
            sid = valid[0]["sid"]
            print(f"Recovered TWILIO_ACCOUNT_SID from Accounts API: {mask(sid)}")
            return sid
        if len(valid) > 1:
            print("Multiple Twilio accounts were returned. Refusing to guess.")
            for i, a in enumerate(valid, 1):
                print(f"  {i}. {mask(a.get('sid',''))} | {a.get('friendly_name','')} | {a.get('status','')}")
            print("Set TWILIO_ACCOUNT_SID manually to the correct AC... value.")
            return ""
        print("Accounts API returned no valid AC... account SID.")
    except Exception as e:
        print(f"Accounts API did not recover Account SID: {e}")

    return ""

def lookup_incoming_number(account_sid: str, number_sid: str, api_key_sid: str, api_key_secret: str) -> dict:
    return twilio_get(
        f"https://api.twilio.com/2010-04-01/Accounts/{urllib.parse.quote(account_sid)}/IncomingPhoneNumbers/{urllib.parse.quote(number_sid)}.json",
        api_key_sid,
        api_key_secret,
    )

def list_incoming_numbers(account_sid: str, api_key_sid: str, api_key_secret: str) -> list:
    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{urllib.parse.quote(account_sid)}/IncomingPhoneNumbers.json?PageSize=1000"
    )
    data = twilio_get(url, api_key_sid, api_key_secret)
    return data.get("incoming_phone_numbers", [])

def list_trunk_phone_numbers(trunk_sid: str, api_key_sid: str, api_key_secret: str) -> list:
    url = f"https://trunking.twilio.com/v1/Trunks/{urllib.parse.quote(trunk_sid)}/PhoneNumbers?PageSize=1000"
    data = twilio_get(url, api_key_sid, api_key_secret)
    return data.get("phone_numbers", [])

def choose_number_interactively(candidates: list) -> str:
    print("")
    print("Multiple Israeli Twilio numbers were found. Choose the test DID:")
    for i, n in enumerate(candidates, 1):
        e164 = n.get("phone_number", "")
        friendly = n.get("friendly_name", "")
        trunk_sid = n.get("trunk_sid", "")
        print(f"  {i}. {mask(e164)} | friendly={friendly!r} | trunk={mask(trunk_sid)}")

    if not sys.stdin.isatty():
        print("Non-interactive shell; cannot choose. Set TWILIO_TEST_DID manually.")
        return ""

    choice = input("Enter number index to use as TWILIO_TEST_DID, or blank to skip: ").strip()
    if not choice:
        return ""
    try:
        idx = int(choice)
        if 1 <= idx <= len(candidates):
            return candidates[idx - 1].get("phone_number", "")
    except Exception:
        pass

    print("Invalid selection.")
    return ""

def recover_test_did(env: dict, account_sid: str) -> str:
    existing = env.get("TWILIO_TEST_DID", "")
    if is_israeli_e164(existing):
        print(f"TWILIO_TEST_DID already set: {mask(existing)}")
        return existing

    api_key_sid = env.get("TWILIO_API_KEY_SID", "")
    api_key_secret = env.get("TWILIO_API_KEY_SECRET", "")
    trunk_sid = env.get("TWILIO_TRUNK_SID", "")

    trunk_number_sids = set()
    trunk_candidates = []

    if is_trunk_sid(trunk_sid):
        print("Trying to recover test DID from Twilio SIP Trunk phone numbers...")
        try:
            trunk_numbers = list_trunk_phone_numbers(trunk_sid, api_key_sid, api_key_secret)
            for item in trunk_numbers:
                # Depending on Twilio response shape, the E.164 may appear directly or only as a PhoneNumberSid.
                direct = item.get("phone_number") or item.get("friendly_name") or ""
                phone_number_sid = item.get("phone_number_sid") or item.get("sid") or ""

                if phone_number_sid:
                    trunk_number_sids.add(phone_number_sid)

                if is_israeli_e164(direct):
                    trunk_candidates.append({
                        "phone_number": direct,
                        "friendly_name": item.get("friendly_name", ""),
                        "trunk_sid": trunk_sid,
                    })

            if len(trunk_candidates) == 1:
                e164 = trunk_candidates[0]["phone_number"]
                print(f"Recovered TWILIO_TEST_DID from trunk association: {mask(e164)}")
                return e164
        except Exception as e:
            print(f"Trunk PhoneNumbers lookup did not recover DID directly: {e}")

    if not is_account_sid(account_sid):
        print("Cannot list IncomingPhoneNumbers because TWILIO_ACCOUNT_SID is still unknown.")
        return ""

    print("Trying to recover test DID from IncomingPhoneNumbers API...")
    try:
        incoming = list_incoming_numbers(account_sid, api_key_sid, api_key_secret)

        # Prefer numbers attached to the trunk.
        preferred = []
        israel_voice = []

        for n in incoming:
            e164 = n.get("phone_number", "")
            if not is_israeli_e164(e164):
                continue

            caps = n.get("capabilities") or {}
            voice_ok = caps.get("voice", True)
            if not voice_ok:
                continue

            number_sid = n.get("sid", "")
            n_trunk_sid = n.get("trunk_sid", "")

            normalized = {
                "phone_number": e164,
                "friendly_name": n.get("friendly_name", ""),
                "trunk_sid": n_trunk_sid,
                "sid": number_sid,
            }

            israel_voice.append(normalized)

            if (
                (is_trunk_sid(trunk_sid) and n_trunk_sid == trunk_sid)
                or (number_sid in trunk_number_sids)
            ):
                preferred.append(normalized)

        if len(preferred) == 1:
            e164 = preferred[0]["phone_number"]
            print(f"Recovered TWILIO_TEST_DID from trunk-attached IncomingPhoneNumber: {mask(e164)}")
            return e164

        if len(preferred) > 1:
            return choose_number_interactively(preferred)

        if len(israel_voice) == 1:
            e164 = israel_voice[0]["phone_number"]
            print(f"Recovered TWILIO_TEST_DID from only Israeli voice number: {mask(e164)}")
            return e164

        if len(israel_voice) > 1:
            return choose_number_interactively(israel_voice)

        print("No Israeli +972 voice-capable IncomingPhoneNumbers found.")
    except Exception as e:
        print(f"IncomingPhoneNumbers lookup failed: {e}")

    return ""

def main():
    print(f"Reading env file: {ENV_PATH}")
    env = parse_env(ENV_PATH)

    missing_auth = [k for k in REQUIRED_FOR_AUTH if not env.get(k)]
    if missing_auth:
        raise SystemExit(f"ERROR: missing required auth keys in env file: {', '.join(missing_auth)}")

    if not is_api_key_sid(env.get("TWILIO_API_KEY_SID", "")):
        raise SystemExit("ERROR: TWILIO_API_KEY_SID does not look like SK...")

    updates = {}

    account_sid = recover_account_sid(env)
    if account_sid and not env.get("TWILIO_ACCOUNT_SID"):
        updates["TWILIO_ACCOUNT_SID"] = account_sid

    test_did = recover_test_did({**env, **updates}, account_sid)
    if test_did and not env.get("TWILIO_TEST_DID"):
        updates["TWILIO_TEST_DID"] = test_did

    if not updates:
        print("")
        print("No env updates were made.")
        print("Current recovery status:")
        print(f"  TWILIO_ACCOUNT_SID: {'set' if is_account_sid(env.get('TWILIO_ACCOUNT_SID','')) else 'missing'}")
        print(f"  TWILIO_TEST_DID: {'set' if is_israeli_e164(env.get('TWILIO_TEST_DID','')) else 'missing'}")
        return 1

    write_env(ENV_PATH, updates)

    print("")
    print("Updated env file safely:")
    for k, v in updates.items():
        print(f"  {k}={mask(v)}")

    final = parse_env(ENV_PATH)
    print("")
    print("Final status:")
    print(f"  TWILIO_ACCOUNT_SID set: {is_account_sid(final.get('TWILIO_ACCOUNT_SID',''))}")
    print(f"  TWILIO_TEST_DID set: {is_israeli_e164(final.get('TWILIO_TEST_DID',''))}")
    print("")
    print("Backup created if missing:")
    print(f"  {ENV_PATH}.before-recovery")

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
