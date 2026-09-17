/**
 * Preload for the CLI commands: route Node's global `fetch` through the
 * HTTP_PROXY / HTTPS_PROXY / NO_PROXY environment variables.
 *
 * Node's built-in fetch (undici) ignores those variables, so on a machine that
 * reaches the web only through a local proxy every link verification fails
 * with a DNS or connect error. curl honours the same variables, which is why
 * the links look fine by hand. Node 24 has NODE_USE_ENV_PROXY for this; this
 * file is the equivalent for the Node 22 the project runs on.
 *
 * Loaded via `node --import ./scripts/proxy-preload.mjs`. It is a no-op when
 * no proxy variable is set, so the commands behave identically elsewhere.
 */
import { createRequire } from 'node:module'

const proxySet = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some((name) => process.env[name])

if (proxySet) {
  // undici is the fetch implementation Node bundles; the package in
  // node_modules is the same library with the proxy agent exported.
  const require = createRequire(import.meta.url)
  const { setGlobalDispatcher, EnvHttpProxyAgent } = require('undici')
  setGlobalDispatcher(new EnvHttpProxyAgent())
}
