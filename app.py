"""
Heureka Conversions Report - Flask backend.
Proxy pro Heureka Conversion measurement reports API.
API klíč je pouze v ENV (HEUREKA_API_KEY), nikdy neve frontendu.
"""

import os
import re
import time
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
import requests

app = Flask(__name__, static_folder="static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # vypnout cache pro dev

HEUREKA_API_BASE = "https://api.heureka.group"
HEUREKA_API_KEY = os.environ.get("HEUREKA_API_KEY")
CACHE_TTL_SEC = 600  # 10 minut
_cache = {}  # {(date): (timestamp, data)}
MAX_RANGE_DAYS = 366  # max počet dní v rozmezí


def _validate_date(date_str, required=True):
    """Validace formátu date (YYYY-MM-DD). Vrací (ok: bool, error_message: str|None)."""
    if not date_str or not str(date_str).strip():
        return False, "Parametr date je povinný." if required else None
    date_str = str(date_str).strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return False, "Špatný formát date. Očekává se YYYY-MM-DD."
    try:
        parts = date_str.split("-")
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        if y < 2000 or y > 2100 or m < 1 or m > 12 or d < 1 or d > 31:
            return False, "Špatný formát date. Očekává se YYYY-MM-DD."
    except (ValueError, IndexError):
        return False, "Špatný formát date. Očekává se YYYY-MM-DD."
    return True, None


def _get_cached(date):
    now = time.time()
    if date in _cache:
        ts, data = _cache[date]
        if now - ts < CACHE_TTL_SEC:
            return data
        del _cache[date]
    return None


def _set_cache(date, data):
    _cache[date] = (time.time(), data)


@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


def _fetch_one_day(date):
    """Stáhne data pro jeden den (z cache nebo API). Vrací dict s 'conversions' nebo None + error."""
    cached = _get_cached(date)
    if cached is not None:
        return cached, None
    if not HEUREKA_API_KEY:
        return None, (401, "Neplatný nebo chybějící API klíč")
    try:
        r = requests.get(
            f"{HEUREKA_API_BASE}/v1/reports/conversions",
            params={"date": date},
            headers={"x-heureka-api-key": HEUREKA_API_KEY},
            timeout=30,
        )
    except requests.exceptions.Timeout:
        return None, (502, "API je nedostupné (timeout)")
    except requests.exceptions.RequestException:
        return None, (502, "API je nedostupné")
    if r.status_code == 401:
        return None, (401, "Neplatný nebo chybějící API klíč")
    if r.status_code == 403:
        return None, (403, "Chybí oprávnění")
    if r.status_code == 422:
        return None, (422, "Špatný formát date")
    if r.status_code != 200:
        return None, (r.status_code, "API vrátilo chybu")
    try:
        data = r.json()
    except ValueError:
        return None, (502, "Neplatná odpověď API")
    _set_cache(date, data)
    return data, None


@app.route("/api/conversions")
def api_conversions():
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    date_single = request.args.get("date", "").strip()

    # Rozmezí: date_from + date_to
    if date_from or date_to:
        ok1, err1 = _validate_date(date_from, required=True)
        if not ok1:
            return jsonify({"error": err1 or "Parametr date_from je povinný."}), 422
        ok2, err2 = _validate_date(date_to, required=True)
        if not ok2:
            return jsonify({"error": err2 or "Parametr date_to je povinný."}), 422
        try:
            d1 = datetime.strptime(date_from, "%Y-%m-%d")
            d2 = datetime.strptime(date_to, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Špatný formát date. Očekává se YYYY-MM-DD."}), 422
        if d1 > d2:
            return jsonify({"error": "Datum Od musí být před nebo rovno Datum Do."}), 422
        delta = (d2 - d1).days + 1
        if delta > MAX_RANGE_DAYS:
            return jsonify({"error": f"Rozmezí může být maximálně {MAX_RANGE_DAYS} dní."}), 422
        all_conversions = []
        current = d1
        while current <= d2:
            day_str = current.strftime("%Y-%m-%d")
            data, err = _fetch_one_day(day_str)
            if err:
                code, msg = err
                return jsonify({"error": msg}), code
            all_conversions.extend(data.get("conversions") or [])
            current += timedelta(days=1)
        return jsonify({"conversions": all_conversions})

    # Jeden den: parametr date
    ok, err = _validate_date(date_single, required=True)
    if not ok:
        return jsonify({"error": "Zadejte rozmezí (Od a Do) nebo jeden den (parametr date). " + (err or "")}), 422
    data, err = _fetch_one_day(date_single)
    if err:
        code, msg = err
        return jsonify({"error": msg}), code
    return jsonify(data)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
