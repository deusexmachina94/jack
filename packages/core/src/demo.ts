import type { FastifyInstance } from 'fastify';

// A tiny, self-contained interactive demo served at GET / so a public deploy is
// explorable in a browser. It calls this same server's /v1/verify live.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BRIP — live server</title>
<style>
  :root{--bg:#f3f4f7;--surface:#fff;--ink:#14161b;--muted:#565c6b;--line:#e4e6ec;--accent:#4b49e0;--ok:#0e9f6e;--bad:#d14d53;--warn:#b4790b;--mono:ui-monospace,"SF Mono",Menlo,monospace}
  @media(prefers-color-scheme:dark){:root{--bg:#0b0d11;--surface:#14171d;--ink:#e7e9ee;--muted:#9aa1ae;--line:#252a32;--accent:#8987ff;--ok:#34d399;--bad:#f0787d;--warn:#e0a93b}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
  .wrap{max-width:720px;margin:0 auto;padding:48px 20px 80px}
  .tag{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600}
  h1{font-size:30px;letter-spacing:-.02em;margin:10px 0 6px}
  p.lede{color:var(--muted);margin:0 0 28px;max-width:56ch}
  form{display:flex;gap:10px;margin-bottom:10px}
  input{flex:1;padding:12px 14px;font-size:15px;border:1px solid var(--line);border-radius:11px;background:var(--surface);color:var(--ink)}
  input:focus{outline:2px solid var(--accent);border-color:transparent}
  button{padding:0 20px;font-weight:600;color:#fff;background:var(--accent);border:none;border-radius:11px;cursor:pointer;font-size:15px}
  .ex{font-size:13px;color:var(--muted);margin-bottom:26px}.ex a{color:var(--accent);cursor:pointer;text-decoration:none;margin-right:10px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-top:8px}
  .card.hidden{display:none}
  .head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}
  .dom{font-weight:640;font-size:17px}
  .pill{font-family:var(--mono);font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px}
  .pill.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}
  .pill.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 15%,transparent)}
  .u{display:flex;gap:9px;align-items:center;font-family:var(--mono);font-size:13px;padding:4px 0}
  .u .t{padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
  .allowed{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
  .denied{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
  .priced{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
  .body{padding:14px 18px}
  pre{margin:0;font-family:var(--mono);font-size:12px;overflow-x:auto;color:var(--muted);padding:14px 18px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--ink) 3%,transparent)}
  .links{margin-top:34px;font-family:var(--mono);font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:6px}
  .links a{color:var(--accent);text-decoration:none}
  .status{color:var(--muted);font-size:14px;margin:14px 0}
</style></head><body>
<div class="wrap">
  <div class="tag">BRIP · live reference server</div>
  <h1>Verify a URL's AI-licensing terms</h1>
  <p class="lede">This is a running BRIP instance. Enter a URL and it resolves the domain to its verified, machine-readable licensing terms — the same <code>GET /v1/verify</code> any client would call.</p>
  <form id="f"><input id="url" value="https://nzz.ch/article/zurich-2026" spellcheck="false" autocomplete="off"><button>Verify</button></form>
  <div class="ex">Seeded: <a data-u="https://nzz.ch/article/zurich-2026">nzz.ch</a> · try an <a data-u="https://unknown.example/x">unknown domain</a></div>
  <div id="status" class="status"></div>
  <div id="card" class="card hidden"></div>
  <div class="links">
    <a href="/v1/verify?url=https://nzz.ch/a/1">GET /v1/verify?url=…</a>
    <a href="/.well-known/brip-keys.json">GET /.well-known/brip-keys.json</a>
    <a href="/v1/transparency/anchors">GET /v1/transparency/anchors</a>
    <a href="/health">GET /health</a>
  </div>
</div>
<script>
const $=id=>document.getElementById(id),card=$('card'),st=$('status');
const T=v=>'<span class="t '+v+'">'+v+'</span>';
async function verify(url){
  st.textContent='Resolving '+url+' …';card.classList.add('hidden');
  try{
    const r=await fetch('/v1/verify?url='+encodeURIComponent(url));const d=await r.json();st.textContent='';
    const usage=d.terms?.policy?.usage||{};
    const rows=Object.entries(usage).map(([k,v])=>'<div class="u">'+T(v)+' '+k+'</div>').join('');
    const price=d.terms?.policy?.pricing;
    card.innerHTML='<div class="head"><span class="dom">'+(d.domain||url)+'</span>'+
      (d.verified?'<span class="pill ok">● verified</span>':'<span class="pill bad">unverified</span>')+'</div>'+
      '<div class="body">'+(rows||'<span style=color:var(--muted)>No published terms.</span>')+
      (price?'<div class="u" style="margin-top:6px;color:var(--warn)">'+ (price.amountMinor/100).toFixed(2)+' '+price.currency+' / '+price.unit+'</div>':'')+'</div>'+
      '<pre>'+JSON.stringify(d,null,2)+'</pre>';
    card.classList.remove('hidden');
  }catch(e){st.textContent='Error: '+e.message}
}
$('f').addEventListener('submit',e=>{e.preventDefault();verify($('url').value.trim())});
document.querySelectorAll('[data-u]').forEach(a=>a.addEventListener('click',()=>{$('url').value=a.dataset.u;verify(a.dataset.u)}));
verify($('url').value);
</script></body></html>`;

export function demoRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/', async (_req, reply) => reply.header('content-type', 'text/html; charset=utf-8').send(PAGE));
  };
}
