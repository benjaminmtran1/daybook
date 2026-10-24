# Receipt OCR implementation and validation

## Delivered

- `web/ReceiptOCR.tsx` embeds inside the expense form, alongside named `file`, `merchant`, `date`, `total`, and `tax` inputs. It does not save expenses or upload receipts.
- Tesseract.js 7.0.0 runs in a browser worker. Runtime code and English model URLs are pinned to worker/core 7.0.0 and `@tesseract.js-data/eng@1.0.0/4.0.0_best_int` on jsDelivr. Initial scan requires internet for these downloads. Receipt bytes are passed to the local worker, not a receipt service. Existing expense-save attachment upload remains separate and is disclosed.
- JPEG, PNG, WebP photos up to 10 MB; PDFs and HEIC are not OCR inputs. PDF attachments remain supported by the existing form with manual accounting details.
- Conservative candidate extraction: merchant, unambiguous date, labeled total, single included-tax line. Multiple taxes, conflicting totals, ambiguous dates and low text confidence are surfaced for manual review. CAD is assumed, not detected.
- Nothing is preselected or automatically applied. Explicit checked fields are applied only after review. A field edited since scan start cannot be overwritten; applying stops with an explanatory error.
- Repeated scan clicks are guarded. Cancel, a replacement file and component unmount invalidate the run. Worker terminates on recognition completion/failure/cancellation. If cancellation occurs during asynchronous worker initialization, results are discarded immediately and the worker is terminated once initialization resolves. Initial asset downloads may finish despite cancellation.

## Verified on 2026-10-24

- 15 focused parser, lifecycle and React-handler tests passed:
  `cd web && node --experimental-strip-types --test tests/receipt-ocr*.test.mjs`
- `npx tsc --noEmit` passed with integrated dependency.
- Actual Tesseract.js 7 recognition of the synthetic 1000 × 660 receipt fixture passed all four expected fields: MAPLE OFFICE SUPPLY, 2026-10-24, 11.30 total, 1.30 tax.
- Exact pinned public English model: 5.191 seconds including model download; reported text confidence 95%. This is one clean synthetic fixture in Node on the cloud CPU, not a browser/mobile performance or real-world accuracy claim.
- Installed system English model: 0.620–1.382 seconds including worker initialization; same recognized fields/confidence. Different model variant, not the production download benchmark.
- Actual engine test: `cd web && node --experimental-strip-types tests/receipt-ocr-engine.mjs` (downloads pinned public model). To avoid download: set `OCR_LANG_PATH` to a local directory containing `eng.traineddata`.

## Remaining validation limits

- Browser integration/network assertions are written in `web/tests/receipt-ocr-browser.mjs`, but NOT run successfully: local Chromium launch fails with `socket() failed: Operation not permitted` in this executor. No browser or mobile success claim.
- Run Vite with `npx vite --host 127.0.0.1 --port 5181`, then `node tests/receipt-ocr-browser.mjs` on a browser-enabled machine. This harness uses a synthetic form and receipt only, no Daybook account, allows only local requests and GET requests to jsDelivr, and asserts explicit application, untouched merchant, cancellation and PDF fallback.
- Real photos, rotated/blurred receipts, multilingual receipts, Safari/mobile memory limits, first-load CDN failures and actual browser download latency remain to be characterized. No production account data was used.

## Primary references

- https://github.com/naptha/tesseract.js/blob/master/docs/api.md
- https://github.com/naptha/tesseract.js#readme
- Installed official npm package sources: `src/createWorker.js`, `src/worker/browser/defaultOptions.js`, `src/worker-script/browser/getCore.js`, and `src/worker-script/index.js` verified worker, engine/model paths and lifecycle.
