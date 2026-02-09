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

4. **Nastavení API klíče**

   Nastavte proměnnou prostředí `HEUREKA_API_KEY` na váš Heureka API klíč:

   - **Windows (PowerShell):**
     ```powershell
     $env:HEUREKA_API_KEY = "váš-api-klíč"
     ```

   - **Windows (CMD):**
     ```cmd
     set HEUREKA_API_KEY=váš-api-klíč
     ```

   - **Linux / macOS:**
     ```bash
     export HEUREKA_API_KEY="váš-api-klíč"
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

## Bezpečnost

- API klíč Heureka **není nikdy** posílán do prohlížeče ani obsažen v HTML/JS/CSS. Veškerá komunikace s Heureka API probíhá pouze na backendu s využitím `HEUREKA_API_KEY` z prostředí.
