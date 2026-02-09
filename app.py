"""
Heureka Conversions Report - Flask backend.
Proxy pro Heureka Conversion measurement reports API.
Přístup jen po přihlášení (email + heslo).
"""

import json
import os
import re
import time
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, redirect, url_for, session, render_template
from werkzeug.security import check_password_hash, generate_password_hash
import requests

# Načte .env v kořenu projektu (pro lokální vývoj)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__, static_folder="static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or "dev-secret-change-in-production"

# Uživatelé z env (email -> { name, password_hash }); hesla se hashují při startu
def _load_users():
    raw = os.environ.get("AUTH_USERS_JSON")
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    users = {}
    for email, opts in data.items():
        if not isinstance(opts, dict) or "name" not in opts or "password" not in opts:
            continue
        email = str(email).strip().lower()
        if not email:
            continue
        users[email] = {
            "name": str(opts["name"]).strip() or email,
            "password_hash": generate_password_hash(str(opts["password"])),
        }
    return users

USERS = _load_users()
if USERS:
    print(f"[AUTH] Loaded {len(USERS)} user(s): {', '.join(USERS.keys())}")
else:
    print("[AUTH] WARNING: No users loaded! Check AUTH_USERS_JSON in .env")


def _current_user():
    email = session.get("user_id")
    if not email or email not in USERS:
        return None
    return {"email": email, "name": USERS[email]["name"]}


@app.before_request
def require_login():
    if request.path == "/login" or request.path.startswith("/static"):
        return None
    if _current_user() is None:
        if request.path.startswith("/api"):
            return jsonify({"error": "Pro zobrazení dat se přihlaste."}), 401
        return redirect(url_for("login"))
    return None

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


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", error=None)
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    if not email or not password:
        return render_template("login.html", error="Vyplňte e-mail i heslo.")
    if email not in USERS:
        return render_template("login.html", error="Neplatný e-mail nebo heslo.")
    if not check_password_hash(USERS[email]["password_hash"], password):
        return render_template("login.html", error="Neplatný e-mail nebo heslo.")
    session["user_id"] = email
    session["user_name"] = USERS[email]["name"]
    return redirect(url_for("index"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def index():
    user = _current_user()
    return render_template("index.html", user_name=user["name"] if user else None)


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
