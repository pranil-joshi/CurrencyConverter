# Frankfurter_CurrencyConverter

A custom Magento 2 storefront module that adds a currency exchange converter page,
backed by the [Frankfurter](https://frankfurter.dev) exchange-rate API. Buyers can
pick From/To currencies, view live exchange rates, swap the pair, and see how the
rate has moved over time on a historical chart. Built for Magento 2.4.x / PHP 8.

<img width="1345" height="847" alt="Screenshot from 2026-08-10 20-51-30" src="https://github.com/user-attachments/assets/4402a765-8c5e-4729-b192-c6b9ab350a49" />


## Features

- **Storefront page** at `/currencyconverter` — no admin configuration required.
- **Any Frankfurter-supported currency** as From/To (currently 30 currencies), with
  a **swap control** to flip the pair instantly.
- **Current exchange-rate lookup**, fetched server-side and cached.
- **Historical chart** (hand-drawn on `<canvas>`, no external charting library)
  with:
  - Selectable time range — **7D / 1M / 3M / 1Y**
  - A **hover/touch crosshair + tooltip** showing the exact rate and date at any
    point on the line
  - Clean, rounded **Y-axis tick labels** (e.g. `10 / 20 / 100`), computed with a
    "nice numbers" algorithm rather than raw min/max
- **Amount input** — enter any amount and the rate line, change badge and chart
  all re-render **instantly client-side** (no extra request; the unit rate/history
  already in memory is simply scaled).
- **Change badge** — shows the % move over the selected period, direction encoded
  with both an arrow icon and color (not color alone).
- Fully **responsive** and keyboard/screen-reader friendly (`aria-live` rate
  updates, labelled form controls, no color-only state).

<img width="823" height="682" alt="amount-conversion-1y" src="https://github.com/user-attachments/assets/e94a39c1-9668-42ee-ac83-9e6581595852" />


## Requirements

| | Version |
|---|---|
| Magento | 2.4.x (built and tested against 2.4.6 and 2.4.7) |
| PHP | 8.1 / 8.2 / 8.3 |
| Dependencies | None beyond Magento core (`magento/framework`, `magento/module-store`) — no third-party libraries |

Outbound internet access to `api.frankfurter.dev` is required from the web server.

## Installation

### Option A — clone into `app/code`

From your Magento project root:

```bash
git clone https://github.com/pranil-joshi/CurrencyConverter.git app/code/Frankfurter/CurrencyConverter

bin/magento module:enable Frankfurter_CurrencyConverter
bin/magento setup:upgrade
bin/magento setup:di:compile      # only needed outside developer mode
bin/magento cache:flush
```

After cloning, confirm that `registration.php` sits directly at
`app/code/Frankfurter/CurrencyConverter/registration.php`. If the repository nests
the module one level deeper, move the inner folder's contents up so that
`registration.php` and `etc/module.xml` are at that path.

### Option B — via Composer

If the package is published to Packagist:

```bash
composer require pranil-joshi/module-currency-converter

bin/magento module:enable Frankfurter_CurrencyConverter
bin/magento setup:upgrade
```

Or install directly from the Git repository without Packagist by adding a VCS
repository to your project's `composer.json`:

```json
"repositories": [
  { "type": "vcs", "url": "https://github.com/pranil-joshi/CurrencyConverter.git" }
]
```

then run the same `composer require pranil-joshi/module-currency-converter`.

Then visit **`/currencyconverter`** on the storefront.

## Architecture

```
Api/CurrencyServiceInterface.php        Service contract: getCurrencies() / getLatestRate() / getHistory()
Model/CurrencyService.php               Implementation — calls Frankfurter via Magento's Curl client,
                                         validates currency codes/dates, retries once on failure, caches responses
Model/Cache/Type.php                    Dedicated cache type ("Frankfurter Currency Converter" in
                                         Admin > Cache Management), so it can be inspected/flushed independently
Model/Exception/FrankfurterApiException.php  Thrown on upstream/network failure or malformed response

Controller/Index/Index.php              Renders the storefront page
Controller/Index/Rate.php               AJAX endpoint: GET currencyconverter/index/rate?from=&to=&days=

Block/Converter.php                     Supplies the currency list + widget config JSON to the template
view/frontend/templates/converter.phtml Markup: currency selects, swap button, amount input, period toggle, chart
view/frontend/web/js/converter.js       RequireJS widget: AJAX fetch, canvas chart rendering, hover crosshair,
                                         amount scaling, period switching — no external JS dependency
view/frontend/web/css/converter.css     All styling (no inline CSS/JS anywhere in the module)

etc/di.xml                              Interface preference + a dedicated Monolog logger/handler virtualType
etc/cache.xml                           Registers the "frankfurter_currency" cache type
etc/frontend/routes.xml                 Registers the "currencyconverter" frontend route
```

**Design choices worth calling out:**

- `CurrencyServiceInterface` sits behind a `di.xml` preference (not called directly),
  so the Frankfurter client can be swapped or mocked without touching controllers/blocks.
- The currency list is cached for 24h, and rate/history lookups for 5 minutes — the
  storefront never calls the upstream API on every request.
- The single AJAX request per lookup returns **both** the current rate and the full
  history window in one payload; changing the amount afterwards is purely a client-side
  recompute (no network round-trip).
- The block is deliberately marked `cacheable="false"` in layout XML. The page's real
  content is always fetched live via AJAX anyway, and the currency list is already
  cached at the service layer — leaving Full Page Cache enabled here would risk a rare
  upstream timeout getting "frozen" into the cached page for a full day.
- All outbound API calls are validated (currency codes checked against the live
  currency list, dates checked against `Y-m-d`) before being interpolated into the
  request URL.

## Logging

The module logs to its own file, `var/log/frankfurter_currency_converter.log`
(via a dedicated Monolog handler registered in `etc/di.xml`), rather than the
shared `system.log` — successful upstream calls at `INFO`, failures at `ERROR`.

## Caching

Registered as its own cache type, **"Frankfurter Currency Converter"**, visible
and flushable independently under **Admin > System > Cache Management**.

## Notes / possible next steps

- No automated tests are included; given more time, unit tests for
  `CurrencyService` (mocking the Curl client) and an integration test for the
  `Rate` controller would be the next addition.
- No admin configuration screen — the base/quote defaults (`USD`/`EUR`) and cache
  TTLs are constants in `Block/Converter.php` and `Model/CurrencyService.php`;
  promoting them to `system.xml` config would be a natural follow-up if this needed
  to be merchant-configurable.
