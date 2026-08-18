#!/usr/bin/env python3
"""Optional local helper. Preferred path is OAuth Playground — see docs/ga4-setup.md.

Reuse the live Google Ads OAuth client (not GSC):

  export GOOGLE_ADS_CLIENT_ID='....apps.googleusercontent.com'
  export GOOGLE_ADS_CLIENT_SECRET='....'
  python3 scripts/get-ga4-refresh-token.py

Then store the printed value as GOOGLE_GA4_REFRESH_TOKEN.
Playground is easier if the Ads client can add
https://developers.google.com/oauthplayground as a redirect URI.
"""

from __future__ import annotations

import http.server
import os
import sys
import threading
import urllib.parse
import webbrowser

try:
    import requests
except ImportError:
    print("Missing dependency: pip install requests", file=sys.stderr)
    sys.exit(1)

CLIENT_ID = (
    os.environ.get("GOOGLE_GA4_CLIENT_ID", "").strip()
    or os.environ.get("GOOGLE_ADS_CLIENT_ID", "").strip()
)
CLIENT_SECRET = (
    os.environ.get("GOOGLE_GA4_CLIENT_SECRET", "").strip()
    or os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "").strip()
)
REDIRECT_URI = "http://127.0.0.1:8766/"
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

if not CLIENT_ID or not CLIENT_SECRET:
    print(
        "Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET "
        "(the live Google Ads OAuth client), or GOOGLE_GA4_* overrides.",
        file=sys.stderr,
    )
    sys.exit(1)

auth_code: dict[str, str] = {}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if "code" in qs:
            auth_code["code"] = qs["code"][0]
            body = b"<html><body><h2>OK — you can close this tab.</h2></body></html>"
            self.send_response(200)
        else:
            err = qs.get("error", ["unknown"])[0]
            body = f"<html><body><h2>Error: {err}</h2></body></html>".encode()
            self.send_response(400)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A003
        return


def main() -> None:
    print(
        "Preferred: https://developers.google.com/oauthplayground/ "
        "with the Google Ads OAuth client (docs/ga4-setup.md).\n"
        "This script is a local fallback for Desktop/loopback clients.\n"
    )
    server = http.server.HTTPServer(("127.0.0.1", 8766), Handler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "login_hint": "chifung.login@gmail.com",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    print("Opening browser for Google consent…")
    print("Sign in as chifung.login@gmail.com (the account with all GA4 properties).")
    print(url)
    webbrowser.open(url)
    thread.join(timeout=180)
    server.server_close()

    if "code" not in auth_code:
        print("No authorization code received (timeout or cancel).", file=sys.stderr)
        sys.exit(1)

    token_res = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": auth_code["code"],
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if not token_res.ok:
        print(f"Token exchange failed: {token_res.status_code} {token_res.text}", file=sys.stderr)
        sys.exit(1)

    payload = token_res.json()
    refresh = payload.get("refresh_token")
    if not refresh:
        print(
            "No refresh_token in response. Revoke prior grants for this client "
            "at https://myaccount.google.com/permissions and retry with prompt=consent.",
            file=sys.stderr,
        )
        print(payload)
        sys.exit(1)

    print("\n=== SUCCESS — store this as Supabase secret GOOGLE_GA4_REFRESH_TOKEN ===\n")
    print(refresh)
    print("\nClient ID/Secret stay on the Google Ads OAuth client unless you overrode GOOGLE_GA4_*.\n")


if __name__ == "__main__":
    main()
