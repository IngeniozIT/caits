// What `npm start` runs: `npm run build` builds the server of the app from this file, which the adapter of CAITS (adapter.js) gives to
// @marko/run. It serves the files, the pages and the handlers of the app as the entry of @marko/run does, boots the backend first, and
// stops it on SIGTERM or SIGINT.
import { createMiddleware } from "@marko/run/adapter/middleware";
import { fetch } from "@marko/run/router";
import compression from "compression";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import createStaticServe from "serve-static";
import { boot } from "./kernel.js";
import { serve, stopOnSignals } from "./serve.js";

const folder = dirname(fileURLToPath(import.meta.url));
const middleware = createMiddleware(fetch);
const compress = compression({ flush: zlib.constants.Z_PARTIAL_FLUSH, threshold: 500 });
const servePublic = createStaticServe(`${folder}/public`, { index: false, redirect: false, maxAge: "10 minutes" });
const serveAssets = createStaticServe(`${folder}/public/assets`, { index: false, redirect: false, immutable: true, fallthrough: false, maxAge: "365 days" });

const served = await serve({
  port: Number(process.env.PORT ?? 3000),
  boot,
  handle: (request, response) => {
    compress(request, response, () => {
      if (request.url?.startsWith("/assets/")) {
        request.url = request.url.slice("/assets".length);
        serveAssets(request, response, () => {
          response.statusCode = 404;
          response.end();
        });
      } else {
        servePublic(request, response, () => { middleware(request, response); });
      }
    });
  }
});
stopOnSignals(served.close);
