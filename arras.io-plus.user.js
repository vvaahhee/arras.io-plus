// ==UserScript==
// @name         arras.io+ loader
// @namespace    https://github.com/vvaahhee/arras.io-plus
// @version      2.0.2
// @description  Loads arras.io+ at arras.io/+
// @author       vahe
// @icon         https://raw.githubusercontent.com/vvaahhee/arras.io-plus/main/icon.png
// @match        https://arras.io/+*
// @run-at       document-start
// @inject-into  page
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @downloadURL  none
// @updateURL    none
// ==/UserScript==

(() => {
  'use strict';
  const DIST = 'https://raw.githubusercontent.com/vvaahhee/arras.io-plus/main/dist/';

  const LOCK = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    "worker-src blob:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net/npm/@fontsource/noto-emoji@5.3.2/ " +
      'https://cdn.jsdelivr.net/npm/twemoji-colr-font@15.0.3/',
    'img-src data: blob:',
    'media-src blob:',
    'connect-src https://arras.io:* wss://arras.io:* https://*.arras.io:* wss://*.arras.io:* https://*.uvwx.xyz:* ' +
      'wss://*.uvwx.xyz:* https://raw.githubusercontent.com/vvaahhee/arras.io-plus/main/CHANGELOG.md blob: data:',
    'frame-src https://challenges.cloudflare.com',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const write = (html) => {
    document.open();
    document.write(`<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${LOCK}">` + html);
    document.close();
  };
  write('<!DOCTYPE html><html style="background:#484848"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding-top:45vh;text-align:center;color:#d8d8d8;font:bold 16px Ubuntu,sans-serif"></body></html>');

  const db = (mode, act) => new Promise((resolve, reject) => {
    const open = indexedDB.open('client', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode), req = act(tx.objectStore('files'));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { open.result.close(); reject(tx.error); };
    };
  });
  const load = () => db('readonly', (s) => s.get('release')).catch(() => null);
  const save = (release) => db('readwrite', (s) => s.put(release, 'release'));

  const get = (url, responseType) => new Promise((resolve, reject) => GM_xmlhttpRequest({
    url, responseType, nocache: true,
    onload: (r) => r.status === 200 ? resolve(r.response) : reject(r.status),
    onerror: reject, ontimeout: reject,
  }));
  const latest = () => get(`${DIST}release.json?${Date.now()}`, 'json').then((r) => r.version);
  const unzip = async (file) => new Uint8Array(await new Response(
    new Response(await get(DIST + file, 'arraybuffer')).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

  const download = async (version) => {
    const [page, wasm] = await Promise.all([unzip(`page-${version}.html.gz`), unzip(`app-${version}.wasm.gz`)]);
    let binary = '';
    for (let i = 0; i < wasm.length; i += 32768) binary += String.fromCharCode(...wasm.subarray(i, i + 32768));
    return { version, page: new TextDecoder().decode(page), wasm: btoa(binary) };
  };

  const newer = (a, b) => {
    const x = a.split('.'), y = b.split('.');
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] | 0) !== (y[i] | 0)) return (x[i] | 0) > (y[i] | 0);
    }
    return false;
  };

  const update = async (running) => {
    try {
      const saved = await load();
      if (!saved || !newer(saved.version, running)) {
        const version = await latest();
        if (!newer(version, running)) return setTimeout(update, 60000, running);
        await save(await download(version));
      }
      document.documentElement.setAttribute('data-update-ready', '');
      dispatchEvent(new Event('update-ready'));
    } catch {
      setTimeout(update, 60000, running);
    }
  };

  const start = (release) => {
    write(release.page.replace('/*WASM*/null', () => JSON.stringify(release.wasm)));
    update(release.version);
  };

  const first = async () => {
    document.body.textContent = 'Downloading arras.io+...';
    try {
      const release = await download(await latest());
      await save(release).catch(() => {});
      start(release);
    } catch {
      setTimeout(first, 5000);
    }
  };

  load().then((release) => release ? start(release) : first());
})();
