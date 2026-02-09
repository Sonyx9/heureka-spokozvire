# Heureka Conversions Report

Jednoduchá webová aplikace, která stáhne a zobrazí data z **Heureka Conversion measurement reports API**. Backend funguje jako proxy – API klíč je pouze na serveru v proměnné prostředí, nikdy neve frontendu.

## Požadavky

- Python 3.8+
- Účet Heureka s API klíčem pro Conversion measurement reports

## Nastavení

1. **Klonování / přechod do složky projektu**

   ```bash
   cd Heureka
   ```

2. **Virtuální prostředí (doporučeno)**

   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Instalace závislostí**

   ```bash
   pip install -r requirements.txt
   ```

4. **Proměnné prostředí (API klíč a přihlášení)**

   Zkopírujte `.env.example` na `.env` a vyplňte hodnoty. **Soubor `.env` necommitujte** (je v `.gitignore`).

   | Proměnná | Popis |
   |----------|--------|
   | `FLASK_SECRET_KEY` | Tajný klíč pro Flask session (na produkci povinné, např. dlouhý náhodný řetězec). |
   | `HEUREKA_API_KEY` | Heureka API klíč pro Conversion measurement reports. |
   | `AUTH_USERS_JSON` | JSON s přihlašovacími účty – viz níže. |

   **Formát `AUTH_USERS_JSON`:** objekt, kde klíč je e-mail a hodnota `{ "name": "Zobrazované jméno", "password": "heslo" }`. Příklad:

   ```json
   {"postmaster@example.com":{"name":"Admin","password":"tajne-heslo"},"druhy@example.com":{"name":"Účet 2","password":"dalsi-heslo"}}
   ```

   - **Windows (PowerShell)** – pro lokální vývoj můžete nastavit v terminálu:
     ```powershell
     $env:HEUREKA_API_KEY = "váš-api-klíč"
     $env:FLASK_SECRET_KEY = "náhodný-tajný-řetězec"
     $env:AUTH_USERS_JSON = '{"email@example.com":{"name":"Admin","password":"heslo"}}'
     ```

   - **Linux / macOS:**
     ```bash
     export HEUREKA_API_KEY="váš-api-klíč"
     export FLASK_SECRET_KEY="náhodný-tajný-řetězec"
     export AUTH_USERS_JSON='{"email@example.com":{"name":"Admin","password":"heslo"}}'
     ```

   API klíč získáte v Heureka rozhraní (např. v nastavení účtu / API).

## Spuštění

V kořenu projektu spusťte:

```bash
flask run
```

Případně:

```bash
python -m flask run
```

Aplikace poběží na adrese **http://127.0.0.1:5000**. Otevřete ji v prohlížeči, zvolte rozmezí dat (Od / Do) a klikněte na **Načíst report**.

### Alternativa bez `flask` příkazu

```bash
python app.py
```

Server se spustí na http://127.0.0.1:5000 (včetně debug režimu).

## Příklad requestu (curl)

**Jeden den** (parametr `date`):

```bash
curl -s "http://127.0.0.1:5000/api/conversions?date=2025-02-09"
```

**Rozmezí dat** (parametry `date_from` a `date_to`, max 31 dní):

```bash
curl -s "http://127.0.0.1:5000/api/conversions?date_from=2025-02-01&date_to=2025-02-09"
```

Odpověď je JSON ve **stejném tvaru jako Heureka API**: objekt s klíčem `conversions`, což je pole záznamů. Při rozmezí backend volá Heureka API pro každý den v intervalu a spojí výsledky do jednoho pole. Každý záznam obsahuje mj. `date`, `product_card_id`, `on_bidded_position`, `click_source`, `satellite_name`, `shop_item` (s `id`, `name`), `portal_category` (s `id`), `visits`, `costs_with_vat`, `costs_without_vat`, `orders`, `revenue` (vše s podklíči `total`, `free`, `bidded`, `not_bidded` podle specifikace Heureka).

Bez platného data (422):

```bash
curl -s "http://127.0.0.1:5000/api/conversions"
curl -s "http://127.0.0.1:5000/api/conversions?date_from=2025-02-01&date_to=invalid"
```

## Endpointy aplikace

| Metoda | Cesta | Popis |
|--------|-------|--------|
| GET | `/` | HTML stránka s reportem (rozmezí Od/Do, souhrn, tabulka, filtry, export CSV). |
| GET | `/api/conversions?date=YYYY-MM-DD` | Jeden den. Proxy na Heureka API. Parametr `date` (YYYY-MM-DD). Vrací JSON s `conversions`. |
| GET | `/api/conversions?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` | Rozmezí (max 31 dní). Backend volá API pro každý den a spojí výsledky. Vrací JSON s `conversions`. |

## Chybové stavy API (backend)

- **401** – Neplatný nebo chybějící API klíč (včetně chybějící `HEUREKA_API_KEY`).
- **403** – Chybí oprávnění (Heureka vrátila 403).
- **422** – Špatný formát `date` nebo chybějící parametr `date`.
- **502** – API je nedostupné (timeout, síťová chyba nebo neplatná odpověď).

V odpovědi je vždy JSON s klíčem `error` a textem pro zobrazení uživateli.

## Funkce UI

- **Rozmezí dat** – pole **Od** a **Do** (výchozí obě dnešek), tlačítko **Načíst report**. Report se načte pro všechny dny v intervalu (max 31 dní).
- **Souhrn za období** – součty přes všechny položky: Visits (total / free / bidded / not_bidded), Orders, Revenue, Costs with VAT, Costs without VAT, odvozené **ROAS** a **PNO**.
- **Tabulka** – sloupce: date, click_source, on_bidded_position, satellite_name, product_card_id, shop_item.id, shop_item.name, portal_category.id, visits.total, costs_with_vat.total, orders.total, revenue.total. Výchozí řazení: **revenue.total** sestupně. Kliknutím na hlavičku sloupce lze měnit řazení.
- **Vyhledávání** – podle názvu nebo ID položky (shop_item.name, shop_item.id).
- **Filtry** – **click_source** (select), **on_bidded_position** (Vše / Ano / Ne).
- **Export CSV** – export aktuálně filtrovaných a seřazených řádků tabulky.

## Caching

Backend cachuje odpověď Heureka API v paměti podle parametru `date` na **10 minut**. Opakované požadavky pro stejné datum v tomto intervalu nevolají Heureka API znovu.

## Struktura projektu

```
Heureka/
  app.py              # Flask aplikace, proxy /api/conversions, validace, cache
  requirements.txt
  README.md
  templates/
    index.html        # Jediná stránka aplikace
  static/
    app.js            # Logika načítání, souhrn, tabulka, filtry, řazení, CSV export
    styles.css        # Minimální styly
```

## Nasazení na Railway

Aplikace je připravena na deploy na [Railway](https://railway.app). **Žádné hesla ani API klíče neukládejte do Gitu** – nastavte je jako **Variables** v Railway dashboardu:

1. V projektu Railway: **Variables** → přidejte:
   - `FLASK_SECRET_KEY` – silný náhodný řetězec (např. vygenerovaný: `python -c "import secrets; print(secrets.token_hex(32))"`).
   - `HEUREKA_API_KEY` – váš Heureka API klíč.
   - `AUTH_USERS_JSON` – JSON s účty (e-mail → `{"name":"…","password":"…"}`). Uvnitř JSONu uvozovky u řetězců escapeujte podle pravidel Railway (obvykle dvojité uvozovky `"`).

2. Build a start: Railway typicky detekuje Python a spustí `python app.py` nebo `gunicorn`; v `Procfile` nebo nastavení můžete uvést např. `web: gunicorn -w 1 -b 0.0.0.0:$PORT app:app` (přidejte `gunicorn` do `requirements.txt`).

## Bezpečnost

- API klíč Heureka a přihlašovací údaje **nejsou v repozitáři**. Načítají se pouze z proměnných prostředí (lokálně z `.env`, na Railway z Variables).
- API klíč **není nikdy** posílán do prohlížeče ani obsažen v HTML/JS/CSS. Veškerá komunikace s Heureka API probíhá pouze na backendu.
