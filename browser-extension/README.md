# ShopMate Ozon Public Evidence Collector

This extension parses public Ozon product information that is visible on the current page only after the user clicks "Read current page". It does not auto-paginate, crawl in the background, read cookies, read site local storage, or connect to the Ozon seller backend.

## Local Installation

1. Open `chrome://extensions/` in Chrome.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select the repository's `browser-extension` directory.
5. Open the extension settings and enter the local API URL plus the access token for the current ShopMate account.

Default API URL: `http://127.0.0.1:3000/api/v1`.

## Workflow

1. Open an Ozon search, category, or public product page in the browser.
2. Click the extension and choose "Read current page".
3. Review the item count, confidence score and up to 8 local preview items.
4. Click "Confirm and submit" after checking the preview.
5. The ShopMate backend revalidates the domain, capture time, field scope, evidence hash and confidence score.
6. Evidence below 0.65 confidence requires human review before it can enter automatic scoring.

## Security Boundary

- The extension does not store model API keys or Ozon seller API keys.
- The access token is stored only in `chrome.storage.local` and can be cleared from settings at any time.
- Product URLs must belong to `ozon.ru`; the backend rejects other domains and private-network URLs.
- The extension does not fabricate prices, sales, reviews, costs or profit.
