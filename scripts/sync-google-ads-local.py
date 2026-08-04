#!/usr/bin/env python3
"""Local bootstrap sync: Google Ads API → Supabase (same shape as Edge Function).

Requires:
  /home/ubuntu/.config/google-ads/google-ads.yaml
  env VITE_SUPABASE_URL (or SUPABASE_URL)
  env SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY for limited testing)

Usage:
  python3 scripts/sync-google-ads-local.py
"""

from __future__ import annotations

import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import urllib.error
import urllib.request
import json

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

YAML = Path("/home/ubuntu/.config/google-ads/google-ads.yaml")
MCC = "5641404438"


def supabase_rest(method: str, path: str, payload=None, prefer: str | None = None):
    base = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
    )
    if not base or not key:
        raise SystemExit("Missing SUPABASE_URL / service role (or anon) key in env")
    url = f"{base.rstrip('/')}/rest/v1/{path}"
    data = None if payload is None else json.dumps(payload).encode()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode()
        return json.loads(body) if body else None


def main() -> int:
    if not YAML.exists():
        print(f"Missing {YAML}")
        return 1

    client = GoogleAdsClient.load_from_storage(str(YAML), version="v25")
    ga = client.get_service("GoogleAdsService")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    run_id = f"gads_local_{int(time.time())}"

    supabase_rest(
        "POST",
        "google_ads_sync_runs",
        {
            "id": run_id,
            "status": "running",
            "started_at": now,
        },
        prefer="return=minimal",
    )

    q = """
      SELECT
        customer_client.descriptive_name,
        customer_client.id,
        customer_client.manager,
        customer_client.status,
        customer_client.level,
        customer_client.currency_code,
        customer_client.time_zone
      FROM customer_client
    """
    rows = list(ga.search(customer_id=MCC, query=q))
    accounts = []
    for r in rows:
        cc = r.customer_client
        accounts.append(
            {
                "customer_id": str(cc.id),
                "descriptive_name": cc.descriptive_name or "",
                "currency_code": cc.currency_code or None,
                "time_zone": cc.time_zone or None,
                "status": cc.status.name,
                "is_manager": bool(cc.manager),
                "level": int(cc.level),
                "manager_customer_id": None if cc.manager else MCC,
                "last_synced_at": now,
                "updated_at": now,
            }
        )
    if not any(a["customer_id"] == MCC for a in accounts):
        accounts.insert(
            0,
            {
                "customer_id": MCC,
                "descriptive_name": "Franco Lee MCC",
                "currency_code": None,
                "time_zone": None,
                "status": "ENABLED",
                "is_manager": True,
                "level": 0,
                "manager_customer_id": None,
                "last_synced_at": now,
                "updated_at": now,
            },
        )

    supabase_rest(
        "POST",
        "google_ads_accounts?on_conflict=customer_id",
        accounts,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"accounts upserted: {len(accounts)}")

    end = date.today()
    start = end - timedelta(days=30)
    metrics_q = """
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    """

    leaf = [a for a in accounts if not a["is_manager"]]
    campaigns_synced = 0
    errors = []
    for acc in leaf:
        cid = acc["customer_id"]
        try:
            camp_rows = list(ga.search(customer_id=cid, query=metrics_q))
        except GoogleAdsException as ex:
            errors.append(f"{cid}: {ex.failure.errors[0].message if ex.failure.errors else ex}")
            continue
        batch = []
        for row in camp_rows:
            batch.append(
                {
                    "id": f"{cid}:{row.campaign.id}",
                    "customer_id": cid,
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name or "",
                    "status": row.campaign.status.name,
                    "advertising_channel_type": row.campaign.advertising_channel_type.name
                    if row.campaign.advertising_channel_type
                    else None,
                    "impressions": int(row.metrics.impressions),
                    "clicks": int(row.metrics.clicks),
                    "cost_micros": int(row.metrics.cost_micros),
                    "conversions": float(row.metrics.conversions),
                    "ctr": float(row.metrics.ctr),
                    "average_cpc_micros": int(row.metrics.average_cpc),
                    "metrics_start_date": start.isoformat(),
                    "metrics_end_date": end.isoformat(),
                    "last_synced_at": now,
                    "updated_at": now,
                }
            )
        for i in range(0, len(batch), 200):
            chunk = batch[i : i + 200]
            if not chunk:
                continue
            supabase_rest(
                "POST",
                "google_ads_campaigns?on_conflict=id",
                chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )
        campaigns_synced += len(batch)
        print(f"  {cid} campaigns={len(batch)}")

    supabase_rest(
        "PATCH",
        f"google_ads_sync_runs?id=eq.{run_id}",
        {
            "status": "success" if campaigns_synced or not errors else "error",
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "accounts_synced": len(accounts),
            "campaigns_synced": campaigns_synced,
            "error_message": " | ".join(errors[:10]) if errors else None,
            "meta": {"errors": len(errors), "source": "local_script"},
        },
        prefer="return=minimal",
    )
    print(f"DONE accounts={len(accounts)} campaigns={campaigns_synced} errors={len(errors)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode()[:1000], file=sys.stderr)
        raise SystemExit(2)
