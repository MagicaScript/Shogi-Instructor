/**
 * Lishogi XHR Interceptor & Chunk Beacon
 * Captures game data and sends it to local server via image requests (CSP bypass)
 */

(function () {
  const origXhrJson = window.lishogi.xhr.json.bind(window.lishogi.xhr);
  window.lishogi.xhr.json = function (method, url, ...args) {
    return origXhrJson(method, url, ...args).then((data) => {
      if (data && data.steps) {
        window.dispatchEvent(
          new CustomEvent("lishogi-game-data", { detail: data }),
        );
      }
      return data;
    });
  };
})();

var latestData = lishogi.modulesData.round.data;

window.addEventListener("lishogi-game-data", (e) => {
  latestData = e.detail;
});

(() => {
  const ENDPOINT = "http://127.0.0.1:3080/api/chunk";
  const INTERVAL_MS = 500;
  const CHUNK_SIZE = 1200;
  const MAX_INFLIGHT = 8;

  const te = new TextEncoder();

  function b64urlFromBytes(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function b64urlFromString(str) {
    return b64urlFromBytes(te.encode(str));
  }

  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /** Send data via img src to bypass CSP restrictions */
  function sendImg(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.onload = img.onerror = () => resolve();
      img.src = url;
    });
  }

  async function sendWithLimit(urls, limit) {
    let i = 0;
    const workers = Array.from(
      { length: Math.min(limit, urls.length) },
      async () => {
        while (i < urls.length) await sendImg(urls[i++]);
      },
    );
    await Promise.all(workers);
  }

  let lastHash = null;

  async function chunkAndSend(obj) {
    const json = JSON.stringify(obj);
    const hash = fnv1a32(json);
    if (hash === lastHash) return;
    lastHash = hash;

    const b64 = b64urlFromString(json);
    const id = `${hash}-${Date.now().toString(36)}`;
    const total = Math.ceil(b64.length / CHUNK_SIZE);
    const urls = [];

    for (let idx = 0; idx < total; idx++) {
      const part = b64.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
      urls.push(
        `${ENDPOINT}?id=${encodeURIComponent(id)}` +
          `&h=${encodeURIComponent(hash)}&i=${idx}&n=${total}&d=${part}&t=${Date.now()}`,
      );
    }

    await sendWithLimit(urls, MAX_INFLIGHT);
  }

  function pickRoundData(d) {
    return d?.steps;
  }

  setInterval(() => {
    const d = latestData;
    if (d) chunkAndSend(pickRoundData(d)).catch(() => {});
  }, INTERVAL_MS);
})();
