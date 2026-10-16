'use strict';
const $ = id => document.getElementById(id);
const FIELDS = ['data','azienda','localita','vigneto','email','telefono','monitoraggio','operazioni'];
const FIRMA_DEFAULT = 'Cordiali saluti,\nGemiliano\nFitochimica Sarda S.r.l. – Specialisti in agricoltura';

/* ---------- utility ---------- */
const ls = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2800); }
function today(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function itDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return d+'/'+m+'/'+y; }
function num(s){ if(s==null||s==='') return null; const n=parseFloat(String(s).replace(/\s/g,'').replace(',','.')); return isFinite(n)?n:null; }
function haTxt(n){ return n==null?'':n.toLocaleString('it-IT',{maximumFractionDigits:2})+' ha'; }
function safeName(s){ return (s||'azienda').replace(/[^\w\-àèéìòù ]+/gi,'').trim().replace(/\s+/g,'_').slice(0,50); }
function esc(s){ const d=document.createElement('div'); d.textContent=s==null?'':s; return d.innerHTML.replace(/"/g,'&quot;'); }
const newId = p => p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const lc = s => (s||'').trim().toLowerCase();

/* ---------- archivio sul telefono (IndexedDB) ---------- */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('report-vigneto', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains('visite')) db.createObjectStore('visite', {keyPath:'id'});
      if(!db.objectStoreNames.contains('foto')) db.createObjectStore('foto');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode); const st = tx.objectStore(store);
      const req = fn(st);
      tx.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('operazione annullata'));
    });
  };
  return {
    all: s => run(s, 'readonly', st => st.getAll()),
    keys: s => run(s, 'readonly', st => st.getAllKeys()),
    get: (s, k) => run(s, 'readonly', st => st.get(k)),
    put: (s, v, k) => run(s, 'readwrite', st => k===undefined ? st.put(v) : st.put(v, k)),
    del: (s, k) => run(s, 'readwrite', st => st.delete(k)),
  };
})();

let visite = [];
let editingId = null;
let lastSaved = null;

function sortV(){ visite.sort((a,b)=> (b.data||'').localeCompare(a.data||'') || (b.creato||0)-(a.creato||0)); }
async function loadVisite(){ visite = await idb.all('visite'); sortV(); render(); }
async function saveVisit(v){
  if(!v.id) v.id = newId('v');
  await idb.put('visite', v);
  const i=visite.findIndex(x=>x.id===v.id); if(i>=0) visite[i]=v; else visite.push(v);
  sortV(); render(); return v;
}
async function deleteVisit(id){
  await idb.del('visite', id);
  visite = visite.filter(v=>v.id!==id); render();
  await cleanupPhotos();
}
async function markSent(v){
  v.inviataIl = new Date().toISOString();
  try{ await idb.put('visite', v); }catch(e){}
  render();
}

/* ---------- varietà / vigneti (righe ripetibili) ---------- */
const MAXR = 20;
function righeOf(v){
  if(v?.righe?.length) return v.righe;
  if(v && (v.varieta || v.superficie!=null)) return [{varieta:v.varieta||'', superficie:v.superficie??null}];
  return [];
}
function haIn(n){ return n==null||n==='' ? '' : String(n).replace('.',','); }
function renderRighe(list){
  const box=$('righe'); if(!list || !list.length) list=[{}];
  box.innerHTML = list.slice(0,MAXR).map((r,i)=>`<div class="riga">
    <input id="rv-${i}" data-rv="${i}" list="varietaList" autocapitalize="words" enterkeyhint="next" value="${esc(r.varieta||'')}" placeholder="es. Cannonau" aria-label="Varietà / Vigneto ${i+1}">
    <div class="unit"><input id="rs-${i}" data-rs="${i}" inputmode="decimal" placeholder="0,00" value="${esc(r.raw!=null?r.raw:haIn(r.superficie))}" aria-label="Superficie ${i+1} in ettari"><span>ha</span></div>
    <button type="button" class="rmr" data-rmr="${i}" aria-label="Togli riga ${i+1}">×</button>
  </div>`).join('');
  $('addRiga').disabled = list.length>=MAXR;
  updTot();
}
function rawRighe(){ return [...$('righe').querySelectorAll('.riga')].map(el=>({varieta:el.querySelector('[data-rv]').value, raw:el.querySelector('[data-rs]').value})); }
function readRighe(){ return rawRighe().map(r=>({varieta:r.varieta.trim(), raw:r.raw.trim(), superficie:num(r.raw)})).filter(r=>r.varieta||r.raw); }
function totOf(rows){ const ns=rows.map(r=>r.superficie).filter(n=>n!=null); return ns.length? Math.round(ns.reduce((a,b)=>a+b,0)*10000)/10000 : null; }
function updTot(){ const rows=readRighe(); const t=totOf(rows); $('totHa').textContent = rows.length>1 && t!=null ? 'Totale: '+haTxt(t) : ''; }
$('addRiga').onclick=()=>{ const r=rawRighe(); r.push({}); renderRighe(r); $('rv-'+(r.length-1)).focus(); saveDraft(); };
$('righe').addEventListener('click', e=>{ const b=e.target.closest('[data-rmr]'); if(!b) return; const r=rawRighe(); r.splice(+b.dataset.rmr,1); renderRighe(r); saveDraft(); });
$('righe').addEventListener('input', ()=>{ updTot(); saveDraft(); });

/* ---------- foto ---------- */
const MAXP = 12;
let photos = [];                 // foto del modulo: {id, w, h, caption}; il file sta nell'archivio 'foto'
const thumbUrl = new Map();      // id -> object URL
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('immagine non leggibile')); i.src=src; }); }
function shrinkCanvas(img, max){
  const s=Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
  const w=Math.max(1,Math.round(img.naturalWidth*s)), h=Math.max(1,Math.round(img.naturalHeight*s));
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h);
  return {c, w, h};
}
function shrink(img, max, q){ const {c,w,h}=shrinkCanvas(img,max); return {data:c.toDataURL('image/jpeg', q), w, h}; }
function shrinkBlob(img, max, q){ const {c,w,h}=shrinkCanvas(img,max); return new Promise((res,rej)=>c.toBlob(b=>b?res({blob:b,w,h}):rej(new Error('foto non elaborabile')),'image/jpeg',q)); }
function blobToDataURL(b){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(b); }); }
async function dataURLToBlob(d){ return (await fetch(d)).blob(); }
async function photoBlob(id){ const b=await idb.get('foto', id); if(!b) throw new Error('foto mancante'); return b; }
async function photoData(p){ return {data: await blobToDataURL(await photoBlob(p.id)), w:p.w, h:p.h}; }
async function thumbSrc(id){
  if(thumbUrl.has(id)) return thumbUrl.get(id);
  const u=URL.createObjectURL(await photoBlob(id)); thumbUrl.set(id,u); return u;
}
async function hydrateThumbs(root){
  for(const img of root.querySelectorAll('img[data-pid]')){
    try{ img.src = await thumbSrc(img.dataset.pid); }catch(e){ img.alt='Foto non disponibile'; }
  }
}
async function addFiles(list){
  for(const f of list){
    if(photos.length>=MAXP){ toast('Puoi mettere al massimo '+MAXP+' foto per visita.'); break; }
    if(f.type && !f.type.startsWith('image/')) continue;
    const u=URL.createObjectURL(f);
    try{
      const r=await shrinkBlob(await loadImg(u), 2560, .88);
      const id=newId('f'); await idb.put('foto', r.blob, id);
      photos.push({id, w:r.w, h:r.h, caption:''});
    }catch(e){ toast('Questa foto non si riesce a leggere o salvare.'); }
    finally{ URL.revokeObjectURL(u); }
  }
  renderPhotos(); saveDraft();
}
function renderPhotos(){
  $('phCount').textContent = photos.length ? '('+photos.length+')' : '';
  const box=$('photos');
  if(!photos.length){ box.innerHTML='<div class="photoempty">Nessuna foto. Scatta le foto in vigneto: finiranno nel PDF per il cliente e nel file Excel.</div>'; return; }
  box.innerHTML = photos.map((p,i)=>`<div class="ph"><img data-pid="${esc(p.id)}" alt="Foto ${i+1}"><span class="n">${i+1}</span>
    <button type="button" class="rm" data-rm="${i}" aria-label="Rimuovi foto ${i+1}">×</button>
    <input id="cap-${i}" data-cap="${i}" value="${esc(p.caption||'')}" placeholder="Didascalia (facoltativa)" aria-label="Didascalia foto ${i+1}"></div>`).join('');
  hydrateThumbs(box);
}
$('photos').addEventListener('click', e=>{ const b=e.target.closest('[data-rm]'); if(!b) return; photos.splice(+b.dataset.rm,1); renderPhotos(); saveDraft(); });
$('photos').addEventListener('input', e=>{ const i=e.target.dataset.cap; if(i!=null && photos[i]){ photos[i].caption=e.target.value; saveDraft(); } });
['camIn','galIn'].forEach(id=>$(id).addEventListener('change', async e=>{ const files=[...e.target.files]; e.target.value=''; if(files.length){ toast('Elaboro le foto…'); await addFiles(files); } }));
// toglie dall'archivio le foto che non appartengono più a nessuna visita né al modulo
async function cleanupPhotos(){
  try{
    const used=new Set([...visite.flatMap(v=>(v.foto||[]).map(p=>p.id)), ...photos.map(p=>p.id)]);
    for(const k of await idb.keys('foto')) if(!used.has(k)){ await idb.del('foto', k); const u=thumbUrl.get(k); if(u){ URL.revokeObjectURL(u); thumbUrl.delete(k); } }
  }catch(e){}
}

/* ---------- modulo ---------- */
function readForm(){
  const v={}; FIELDS.forEach(f=>v[f]=$(f).value.trim());
  const rows=readRighe();
  v.righe = rows.map(r=>({varieta:r.varieta, superficie:r.superficie}));
  v.varieta = rows.map(r=>r.varieta).filter(Boolean).join(', ');
  v.superficie = totOf(rows);
  return v;
}
function fillForm(v){ FIELDS.forEach(f=>{ $(f).value = v[f]||''; }); renderRighe(righeOf(v)); photos=(v.foto||[]).map(p=>({...p})); renderPhotos(); saveDraft(); }
function resetForm(){ FIELDS.forEach(f=>$(f).value=''); $('data').value=today(); renderRighe([{}]); photos=[]; renderPhotos(); editingId=null; $('editNote').hidden=true; $('saveBtn').textContent='Salva visita'; saveDraft(); }
function saveDraft(){ const d={}; FIELDS.forEach(f=>d[f]=$(f).value); d.righe=rawRighe(); d.foto=photos; d.editingId=editingId; ls.set('bozza', d); }
$('form').addEventListener('input', saveDraft);

const righeVuote = () => !readRighe().length;
// scelta l'azienda: località, contatti, vigna e varietà dall'ultima visita a quell'azienda
$('azienda').addEventListener('change', ()=>{
  const a=lc($('azienda').value); if(!a) return;
  const prev = visite.find(v=>lc(v.azienda)===a);
  if(!prev) return;
  if(!$('localita').value) $('localita').value=prev.localita||'';
  if(!$('email').value) $('email').value=prev.email||'';
  if(!$('telefono').value) $('telefono').value=prev.telefono||'';
  if(!$('vigneto').value) $('vigneto').value=prev.vigneto||'';
  if(righeVuote() && righeOf(prev).length) renderRighe(righeOf(prev).map(r=>({varieta:r.varieta, superficie:r.superficie})));
  saveDraft(); toast('Dati compilati dall\'ultima visita a '+prev.azienda+'.');
});
// scelta la vigna: varietà e superfici dall'ultima visita a quella vigna
$('vigneto').addEventListener('change', ()=>{
  const g=lc($('vigneto').value); if(!g) return;
  const a=lc($('azienda').value);
  const prev = visite.find(v=>lc(v.vigneto)===g && (!a || lc(v.azienda)===a)) || visite.find(v=>lc(v.vigneto)===g);
  if(prev && righeVuote() && righeOf(prev).length){ renderRighe(righeOf(prev).map(r=>({varieta:r.varieta, superficie:r.superficie}))); saveDraft(); }
});
// scelta una varietà: superficie dall'ultima volta che è stata usata (stessa azienda se possibile)
$('righe').addEventListener('change', e=>{
  const i=e.target.dataset.rv; if(i==null) return;
  const vv=lc(e.target.value); const sIn=$('rs-'+i); if(!vv || sIn.value.trim()) return;
  const a=lc($('azienda').value), g=lc($('vigneto').value);
  const pick = f => { for(const v of visite){ if(!f(v)) continue; const r=righeOf(v).find(r=>lc(r.varieta)===vv && r.superficie!=null); if(r) return r; } };
  const r = pick(v=>lc(v.azienda)===a && lc(v.vigneto)===g) || pick(v=>lc(v.azienda)===a);
  if(r){ sIn.value=haIn(r.superficie); updTot(); saveDraft(); }
});
// testi già usati nei campi Monitoraggio e Operazioni
document.addEventListener('click', e=>{
  const b=e.target.closest('[data-sg]'); if(!b) return;
  const ta=$(b.dataset.sg), t=b.dataset.text;
  ta.value = ta.value.trim() ? ta.value.replace(/\s+$/,'')+'\n'+t : t;
  b.closest('details').open=false; ta.focus(); saveDraft();
});

$('form').addEventListener('submit', async e=>{
  e.preventDefault();
  const v = readForm();
  if(!v.azienda){ $('azienda').focus(); toast('Inserisci il nome dell\'azienda.'); return; }
  if(!v.data){ $('data').focus(); toast('Inserisci la data della visita.'); return; }
  if(v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)){ $('email').focus(); toast('L\'email del cliente non sembra corretta.'); return; }
  { const bad=rawRighe().findIndex(r=>r.raw.trim() && num(r.raw)==null); if(bad>=0){ $('rs-'+bad).focus(); toast('Scrivi la superficie in ettari, ad esempio 2,5.'); return; } }
  const old = editingId ? visite.find(x=>x.id===editingId) : null;
  if(old){ v.id=old.id; v.creato=old.creato; if(old.inviataIl) v.inviataIl=old.inviataIl; }
  else v.creato=Date.now();
  v.modificato=Date.now();
  v.foto = photos.map(p=>({id:p.id, w:p.w, h:p.h, caption:(p.caption||'').trim()}));
  $('saveBtn').disabled = true;
  try{
    lastSaved = await saveVisit(v);
    showDone(lastSaved, !!old);
    photos=[]; resetForm();
    cleanupPhotos();
  }catch(err){ toast('Salvataggio non riuscito: '+(err?.message||'riprova')+'. I dati restano nel modulo.'); }
  finally{ $('saveBtn').disabled=false; }
});
function showDone(v, edited){
  $('form').hidden = true; $('done').hidden = false;
  $('doneTitle').textContent = (edited?'Visita aggiornata: ':'Visita salvata: ')+v.azienda+' – '+itDate(v.data);
  const n=(v.foto||[]).length;
  $('doneState').textContent='✓ Scheda salvata nell\'archivio del telefono'+(n?' con '+n+' foto':'')+'. La ritrovi in Archivio, anche senza connessione.';
  window.scrollTo({top:0});
}
$('newBtn').onclick = ()=>{ $('done').hidden=true; $('form').hidden=false; lastSaved=null; };
$('clearBtn').onclick = ()=>{ resetForm(); cleanupPhotos(); toast('Modulo svuotato.'); };
$('cancelEdit').onclick = ()=>{ resetForm(); cleanupPhotos(); };
$('done').addEventListener('click', e=>{ const b=e.target.closest('[data-act]'); if(b && lastSaved) doAct(b.dataset.act, lastSaved); });

/* ---------- testi per il cliente ---------- */
const firma = () => $('firma').value.trim();
function mailSubject(v){ return 'Report visita in vigneto – '+v.azienda+' – '+itDate(v.data); }
function mailBody(v){
  return 'Gentile '+v.azienda+',\n\nin allegato il report della visita in vigneto del '+itDate(v.data)
    +(v.vigneto?' (vigna '+v.vigneto+')':'')+', con il monitoraggio e le operazioni consigliate'
    +(v.foto?.length?' e la documentazione fotografica':'')+'.\n\nResto a disposizione per qualsiasi chiarimento.\n\n'+firma();
}
function waText(v){
  return 'Buongiorno, le invio il report della visita in vigneto del '+itDate(v.data)+(v.vigneto?' (vigna '+v.vigneto+')':'')
    +' per '+v.azienda+'. Trova in allegato il PDF'+(v.foto?.length?' del report e quello delle foto':'')+'.\n\n'+firma();
}
function waNumber(t){
  let d=(t||'').replace(/[^\d+]/g,'');
  if(!d) return '';
  if(d.startsWith('+')) d=d.slice(1); else if(d.startsWith('00')) d=d.slice(2);
  else if(/^3\d{8,9}$/.test(d) || /^0\d{5,10}$/.test(d)) d='39'+d;   // numero italiano senza prefisso
  return d.replace(/\D/g,'');
}
async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch(e){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){} ta.remove(); return ok; }
}

/* ---------- invio al cliente ---------- */
let shareFiles=null;
async function showSend(v){
  const subj=mailSubject(v), body=mailBody(v);
  $('manTo').textContent = [v.email?'Email: '+v.email:'', v.telefono?'WhatsApp: '+v.telefono:''].filter(Boolean).join(' · ') || 'Nessun contatto del cliente: sceglierai tu la chat o il destinatario.';
  $('manGmail').href = 'https://mail.google.com/mail/?view=cm&fs=1&tf=1&to='+encodeURIComponent(v.email||'')+'&su='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
  $('manGmail').hidden = !v.email;
  $('manMailto').href = 'mailto:'+encodeURIComponent(v.email||'')+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
  $('manWa').href = 'https://wa.me/'+(waNumber(v.telefono)||'')+'?text='+encodeURIComponent(waText(v));
  $('manFotoRow').hidden = !(v.foto?.length);
  const vals={to:v.email||'', su:subj, bo:body}, names={to:'Destinatario', su:'Oggetto', bo:'Testo'};
  $('cpToV').textContent=vals.to||'—'; $('cpSuV').textContent=vals.su; $('cpBoV').textContent=vals.bo.split('\n')[0]+' …';
  $('manual').querySelectorAll('[data-cp]').forEach(b=>{ b.onclick=async()=>toast(await copyText(vals[b.dataset.cp]) ? names[b.dataset.cp]+' copiato.' : 'Copia non riuscita su questo telefono.'); });
  $('manGmail').onclick = ()=>markSent(v);
  $('manMailto').onclick = ()=>markSent(v);
  $('manWa').onclick = ()=>markSent(v);
  $('manPdf').onclick = ()=>downloadPdf(v);
  $('manFoto').onclick = ()=>downloadFotoPdf(v);
  $('manClose').onclick = ()=>{ $('manual').hidden=true; };

  // il menu di condivisione del telefono va aperto subito al tocco: i PDF si preparano prima
  const canShareFiles = !!navigator.canShare && (()=>{ try{ return navigator.canShare({files:[new File(['x'],'t.pdf',{type:'application/pdf'})]}); }catch(e){ return false; } })();
  $('shareRow').hidden = !canShareFiles; $('shareHelp').hidden = !canShareFiles;
  $('manOther').open = !canShareFiles;
  $('manual').hidden=false;
  shareFiles=null;
  if(!canShareFiles) return;
  const btn=$('manShare'); btn.disabled=true; btn.textContent='Preparo i PDF…';
  try{
    await logoData();
    const files=[new File([buildPdf(v)], pdfName(v), {type:'application/pdf'})];
    if(v.foto?.length){
      let buf=await photosPdf(v, null, null);
      if(buf.byteLength > 20*1024*1024) buf=await photosPdf(v, 2000, .82);
      files.push(new File([buf], fotoPdfName(v), {type:'application/pdf'}));
    }
    shareFiles=files;
    btn.textContent='Condividi '+(files.length>1?'i PDF':'il PDF')+' (WhatsApp, Gmail…)';
  }catch(e){ btn.textContent='PDF non pronti: usa Altri modi'; toast('Preparazione PDF non riuscita: '+(e?.message||'errore')); return; }
  btn.disabled=false;
  btn.onclick = async ()=>{
    if(!shareFiles) return;
    try{
      await navigator.share({files:shareFiles, title:subj, text: v.email && !v.telefono ? body : waText(v)});
      await markSent(v); toast('Report condiviso.');
      $('manual').hidden=true;
    }catch(e){
      if(e?.name==='AbortError') return;
      // alcune app rifiutano testo + file insieme: riprova con i soli file
      try{ await navigator.share({files:shareFiles}); await markSent(v); $('manual').hidden=true; }
      catch(e2){ if(e2?.name!=='AbortError') toast('Condivisione non riuscita: usa Altri modi.'); }
    }
  };
}

/* ---------- file da scaricare ---------- */
function saveFile(filename, blob){
  const u=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=u; a.download=filename; a.rel='noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u), 60000);
}

/* ---------- PDF ---------- */
let LOGO=null;
async function logoData(){ if(!LOGO){ try{ LOGO=await blobToDataURL(await (await fetch('logo.jpg')).blob()); }catch(e){} } return LOGO; }
function pdfName(v){ return 'Report_'+safeName(v.azienda)+'_'+(v.data||today())+'.pdf'; }
function fotoPdfName(v){ return 'Foto_'+safeName(v.azienda)+'_'+(v.data||today())+'.pdf'; }
function needPdf(){ if(!window.jspdf){ toast('Il generatore PDF non si è caricato. Chiudi e riapri l\'app.'); return false; } return true; }
// PDF delle foto: una per pagina, orientata come la foto. maxPx null = foto salvata, senza ricompressione.
async function photosPdf(v, maxPx, q){
  const { jsPDF } = window.jspdf;
  const fo=v.foto||[]; let doc=null;
  for(let i=0;i<fo.length;i++){
    const p=fo[i]; let data, w=p.w, h=p.h;
    try{
      data=(await photoData(p)).data;
      if(maxPx!=null){ const r=shrink(await loadImg(data), maxPx, q); data=r.data; w=r.w; h=r.h; }
    }catch(e){ continue; }
    if(!w||!h){ try{ const im=await loadImg(data); w=im.naturalWidth; h=im.naturalHeight; }catch(e){ w=4; h=3; } }
    const orient = w>h ? 'l' : 'p';
    if(!doc) doc=new jsPDF({unit:'mm', format:'a4', orientation:orient}); else doc.addPage('a4', orient);
    const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), m=10;
    doc.setFont('times','bold'); doc.setFontSize(9); doc.setTextColor(47,107,85);
    doc.text('FITOCHIMICA  •  REPORT VISITA IN VIGNETO  •  '+(v.azienda||'')+'  •  '+itDate(v.data), m, 9);
    const top=14, bottom=14, aw=PW-2*m, ah=PH-top-bottom;
    let iw=aw, ih=aw*h/w; if(ih>ah){ ih=ah; iw=ah*w/h; }
    doc.addImage(data,'JPEG',(PW-iw)/2, top+(ah-ih)/2, iw, ih, 'f'+i, 'NONE');
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(29,43,37);
    doc.text(doc.splitTextToSize('Foto '+(i+1)+(p.caption?' – '+p.caption:''), aw)[0], PW/2, PH-6, {align:'center'});
  }
  if(!doc) throw new Error('nessuna foto disponibile');
  return doc.output('arraybuffer');
}
async function downloadFotoPdf(v){
  if(!needPdf()) return;
  toast('Preparo il PDF delle foto…');
  try{ saveFile(fotoPdfName(v), new Blob([await photosPdf(v, null, null)],{type:'application/pdf'})); }
  catch(e){ toast('PDF delle foto non riuscito: '+(e?.message||'errore')); }
}
function buildPdf(v){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const G=[47,107,85], M=15, W=210-2*M;
  const footer=()=>{ doc.setFont('times','bold'); doc.setFontSize(8.5); doc.setTextColor(...G); doc.text('FITOCHIMICA  •  SPECIALISTI IN AGRICOLTURA', 105, 289, {align:'center'}); };
  if(LOGO) doc.addImage(LOGO,'JPEG', 45, 10, 120, 33.6);
  doc.setFont('times','bold'); doc.setFontSize(17); doc.setTextColor(29,43,37);
  doc.text('REPORT VISITA IN VIGNETO', M, 58);
  doc.setFontSize(9); doc.setTextColor(...G); doc.text('DATA VISITA', 140, 58);
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(29,43,37); doc.text(itDate(v.data), 195, 58, {align:'right'});
  doc.setDrawColor(...G); doc.setLineWidth(.5); doc.line(M, 63, 195, 63);
  // fascia dati
  let y=69; doc.setFillColor(...G); doc.rect(M, y, W, 7, 'F');
  doc.setFont('times','bold'); doc.setFontSize(9.5); doc.setTextColor(255,255,255); doc.text('DATI AZIENDA E VIGNETO', M+3, y+4.9);
  y+=7; doc.setDrawColor(207,220,213); doc.setLineWidth(.25);
  const cell=(x,yy,w,h,label,val)=>{ doc.rect(x,yy,w,h); doc.setFont('times','bold'); doc.setFontSize(8); doc.setTextColor(...G); doc.text(label, x+3, yy+5);
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(29,43,37); doc.text(doc.splitTextToSize(val||'', w-6)[0]||'', x+3, yy+12); };
  cell(M,y,W/2,16,'NOME AZIENDA',v.azienda); cell(M+W/2,y,W/2,16,'LOCALITÀ',v.localita); y+=16;
  const rows=righeOf(v), tot=totOf(rows);
  cell(M,y,W*2/3,16,'VIGNA',v.vigneto); cell(M+W*2/3,y,W/3,16, rows.length>1?'SUPERFICIE TOTALE':'SUPERFICIE', tot==null?'':haTxt(tot)); y+=16;
  // tabella varietà / vigneti
  const c1=W*2/3;
  doc.setFillColor(242,247,244); doc.rect(M,y,W,7,'FD');
  doc.setFont('times','bold'); doc.setFontSize(8); doc.setTextColor(...G);
  doc.text('VARIETÀ / VIGNETO', M+3, y+4.8); doc.text('SUPERFICIE', M+c1+3, y+4.8); doc.line(M+c1,y,M+c1,y+7); y+=7;
  const list = rows.length? rows : [{varieta:'',superficie:null}];
  for(const r of list){
    if(y>262){ footer(); doc.addPage(); y=15; }
    doc.rect(M,y,W,7.5); doc.line(M+c1,y,M+c1,y+7.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(29,43,37);
    doc.text(doc.splitTextToSize(r.varieta||'', c1-6)[0]||'', M+3, y+5.2);
    doc.text(r.superficie==null?'':haTxt(r.superficie), M+c1+3, y+5.2);
    y+=7.5;
  }
  // riquadri testo
  const box=(title,text)=>{
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
    let lines = doc.splitTextToSize(text||'', W-8); const lh=5;
    y+=8;
    while(true){
      const room = 280 - y - 12; const fit = Math.max(1, Math.floor(room/lh));
      if(room < 25){ footer(); doc.addPage(); y=15; continue; }
      const part = lines.slice(0, fit); lines = lines.slice(fit);
      const h = Math.max(lines.length? room+12 : 45, 12 + part.length*lh + 4);
      doc.setFillColor(242,247,244); doc.setDrawColor(207,220,213); doc.rect(M,y,W,h,'FD');
      doc.setFont('times','bold'); doc.setFontSize(10); doc.setTextColor(...G); doc.text(title, M+4, y+7);
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(29,43,37);
      doc.text(part, M+4, y+14);
      y += h;
      if(!lines.length) break;
      footer(); doc.addPage(); y=7; title = title+' (segue)';
    }
  };
  box('MONITORAGGIO', v.monitoraggio);
  box('OPERAZIONI CONSIGLIATE', v.operazioni);
  // documentazione fotografica: elenco delle foto, inviate a parte in alta risoluzione
  const fo=v.foto||[];
  if(fo.length){
    const lines=fo.map((p,i)=>'Foto '+(i+1)+(p.caption?'  –  '+p.caption:''));
    y+=8; if(y+14+lines.length*5>280){ footer(); doc.addPage(); y=15; }
    doc.setFillColor(...G); doc.rect(M, y, W, 7, 'F');
    doc.setFont('times','bold'); doc.setFontSize(9.5); doc.setTextColor(255,255,255);
    doc.text('DOCUMENTAZIONE FOTOGRAFICA', M+3, y+4.9);
    y+=12;
    doc.setFont('helvetica','italic'); doc.setFontSize(9.5); doc.setTextColor(93,109,101);
    doc.text(fo.length+' foto in alta risoluzione nel file allegato '+fotoPdfName(v)+':', M+1, y);
    y+=6; doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(29,43,37);
    for(const l of lines){ if(y>278){ footer(); doc.addPage(); y=15; } doc.text(doc.splitTextToSize(l, W-4)[0], M+1, y); y+=5; }
  }
  footer();
  return doc.output('arraybuffer');
}
async function downloadPdf(v){
  if(!needPdf()) return;
  await logoData();
  try{ saveFile(pdfName(v), new Blob([buildPdf(v)],{type:'application/pdf'})); }
  catch(e){ toast('PDF non riuscito: '+(e?.message||'errore')); }
}

/* ---------- Excel ---------- */
$('xlsBtn').onclick = async ()=>{
  if(!visite.length){ toast('Nessuna visita da esportare.'); return; }
  if(!window.ExcelJS){ toast('Il generatore Excel non si è caricato. Chiudi e riapri l\'app.'); return; }
  const btn=$('xlsBtn'); btn.disabled=true; toast('Preparo il file Excel con le foto…');
  try{
    const list=[...visite].sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    const nFoto=Math.max(0, ...list.map(v=>(v.foto||[]).length));
    const wb=new ExcelJS.Workbook(); wb.creator='Fitochimica';
    const ws=wb.addWorksheet('Visite vigneto',{views:[{state:'frozen', ySplit:1}]});
    const cols=[
      {header:'Data visita',key:'data',width:12,style:{numFmt:'dd/mm/yyyy'}},
      {header:'Azienda',key:'azienda',width:26},{header:'Località',key:'localita',width:18},
      {header:'Vigna',key:'vigneto',width:16},{header:'Varietà / Vigneto',key:'varieta',width:30},
      {header:'Superficie totale (ha)',key:'superficie',width:16,style:{numFmt:'0.00'}},
      {header:'Monitoraggio',key:'monitoraggio',width:50},{header:'Operazioni consigliate',key:'operazioni',width:50},
      {header:'Email cliente',key:'email',width:26},{header:'Cellulare cliente',key:'telefono',width:16},
      {header:'Inviato al cliente il',key:'inviato',width:18},
      {header:'Didascalie foto',key:'didascalie',width:30}
    ];
    const base=cols.length;
    for(let k=0;k<nFoto;k++) cols.push({header:'Foto '+(k+1),key:'f'+k,width:22});
    ws.columns=cols;
    const head=ws.getRow(1); head.height=22;
    head.eachCell(c=>{ c.font={bold:true,color:{argb:'FFFFFFFF'}}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2F6B55'}}; c.alignment={vertical:'middle'}; });
    for(const v of list){
      const [y,m,d]=(v.data||'').split('-').map(Number);
      const fo=v.foto||[];
      const row=ws.addRow({
        data: v.data? new Date(Date.UTC(y,m-1,d)) : '', azienda:v.azienda||'', localita:v.localita||'', vigneto:v.vigneto||'',
        varieta: righeOf(v).map(r=>(r.varieta||'—')+(r.superficie!=null?' ('+haTxt(r.superficie)+')':'')).join('\n'),
        superficie: v.superficie==null?null:v.superficie, monitoraggio:v.monitoraggio||'', operazioni:v.operazioni||'',
        email:v.email||'', telefono:v.telefono||'', inviato: v.inviataIl? new Date(v.inviataIl).toLocaleString('it-IT') : '',
        didascalie: fo.map((p,i)=>p.caption?('Foto '+(i+1)+': '+p.caption):'').filter(Boolean).join('\n')
      });
      row.alignment={vertical:'top', wrapText:true};
      if(fo.length) row.height=100;
      for(let k=0;k<fo.length;k++){
        try{
          const full=await photoData(fo[k]);
          const t=shrink(await loadImg(full.data), 360, .75);
          const s=Math.min(150/t.w, 125/t.h);
          const id=wb.addImage({base64:t.data, extension:'jpeg'});
          ws.addImage(id,{tl:{col:base+k+0.08,row:row.number-1+0.08}, ext:{width:Math.round(t.w*s),height:Math.round(t.h*s)}});
        }catch(e){ row.getCell('f'+k).value='(foto non disponibile)'; }
      }
    }
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.length}};
    const out=await wb.xlsx.writeBuffer();
    saveFile('Report_visite_vigneto_'+today()+'.xlsx', new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  }catch(e){ toast('Export Excel non riuscito: '+(e?.message||'errore')); }
  finally{ btn.disabled=false; }
};

/* ---------- backup ---------- */
function showLastBackup(){ const t=ls.get('ultimoBackup',null); $('lastBackup').textContent = t ? 'Ultimo backup: '+new Date(t).toLocaleString('it-IT')+'.' : 'Nessun backup ancora fatto.'; }
$('bkOut').onclick = async ()=>{
  const btn=$('bkOut'); btn.disabled=true; toast('Preparo il backup…');
  try{
    const foto={};
    for(const v of visite) for(const p of (v.foto||[])){ try{ foto[p.id]=await blobToDataURL(await photoBlob(p.id)); }catch(e){} }
    const bk={app:'report-vigneto', versione:1, creato:new Date().toISOString(), firma:$('firma').value, visite, foto};
    const blob=new Blob([JSON.stringify(bk)],{type:'application/json'});
    const name='Backup_report_vigneto_'+today()+'.json';
    const file=new File([blob], name, {type:'application/json'});
    let shared=false;
    if(navigator.canShare?.({files:[file]})){
      try{ await navigator.share({files:[file], title:'Backup report vigneto'}); shared=true; }
      catch(e){ if(e?.name==='AbortError'){ return; } }
    }
    if(!shared) saveFile(name, blob);
    ls.set('ultimoBackup', Date.now()); showLastBackup();
  }catch(e){ toast('Backup non riuscito: '+(e?.message||'errore')); }
  finally{ btn.disabled=false; }
};
$('bkIn').addEventListener('change', async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const bk=JSON.parse(await f.text());
    if(bk?.app!=='report-vigneto' || !Array.isArray(bk.visite)) throw new Error('il file non è un backup di questa app');
    if(!confirm('Importare '+bk.visite.length+' visite dal backup? Le visite già presenti con lo stesso codice verranno sostituite, le altre restano.')) return;
    toast('Importo il backup…');
    for(const [id,d] of Object.entries(bk.foto||{})){ try{ await idb.put('foto', await dataURLToBlob(d), id); }catch(err){} }
    for(const v of bk.visite){ if(v && v.id) await idb.put('visite', v); }
    if(bk.firma && !ls.get('firma',null)){ $('firma').value=bk.firma; ls.set('firma', bk.firma); }
    await loadVisite();
    toast('Importate '+bk.visite.length+' visite.');
  }catch(err){ toast('Importazione non riuscita: '+(err?.message||'file non valido')); }
});

/* ---------- archivio ---------- */
function doAct(act, v){
  if(act==='send') showSend(v);
  else if(act==='pdf') downloadPdf(v);
  else if(act==='fotopdf') downloadFotoPdf(v);
  else if(act==='edit'){ fillForm(v); editingId=v.id; saveDraft(); $('editNote').hidden=false; $('saveBtn').textContent='Salva modifiche'; $('done').hidden=true; $('form').hidden=false; tab('new'); window.scrollTo({top:0}); }
}
function render(){
  $('tCount').textContent = visite.length ? '('+visite.length+')' : '';
  const uniq = arr => { const seen=new Map(); for(const x of arr){ const t=(x||'').trim(); if(t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); } return [...seen.values()]; };
  const opts = arr => arr.map(a=>'<option value="'+esc(a)+'">').join('');
  $('aziendeList').innerHTML = opts(uniq(visite.map(v=>v.azienda)).sort());
  $('localitaList').innerHTML = opts(uniq(visite.map(v=>v.localita)).sort());
  $('vignaList').innerHTML = opts(uniq(visite.map(v=>v.vigneto)).sort());
  $('emailList').innerHTML = opts(uniq(visite.map(v=>v.email)).sort());
  $('telList').innerHTML = opts(uniq(visite.map(v=>v.telefono)).sort());
  $('varietaList').innerHTML = opts(uniq(visite.flatMap(v=>righeOf(v).map(r=>r.varieta))).sort());
  for(const f of ['monitoraggio','operazioni']){
    const texts = uniq(visite.map(v=>v[f])).slice(0,8);   // le più recenti
    const d=$('sg-'+f); d.hidden=!texts.length;
    d.querySelector('.sgl').innerHTML = texts.map(t=>`<button type="button" data-sg="${f}" data-text="${esc(t)}">${esc(t.length>140?t.slice(0,140)+'…':t)}</button>`).join('');
  }
  const q=$('q').value.trim().toLowerCase();
  const shown = visite.filter(v=>!q || [v.azienda,v.localita,v.vigneto,v.varieta,v.monitoraggio,v.operazioni].join(' ').toLowerCase().includes(q));
  $('listCount').textContent = visite.length ? (q? shown.length+' di '+visite.length+' visite' : visite.length+(visite.length===1?' visita':' visite')) : '';
  const list=$('list');
  if(!visite.length){ list.innerHTML='<div class="empty">Nessuna visita salvata.<br>Compila il modulo in "Nuova visita" e premi Salva: comparirà qui.</div>'; return; }
  if(!shown.length){ list.innerHTML='<div class="empty">Nessuna visita corrisponde alla ricerca.</div>'; return; }
  const open = new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.id));
  list.innerHTML = shown.map(v=>`
    <details class="item" data-id="${esc(v.id)}" ${open.has(v.id)?'open':''}>
      <summary><span class="d">${esc(itDate(v.data))}</span><span class="a">${esc(v.azienda)}${v.inviataIl?'<span class="pill">Inviato</span>':''}</span>
      <span class="m">${esc([v.localita, v.vigneto, v.varieta, v.superficie==null?'':haTxt(v.superficie), v.foto?.length?v.foto.length+' foto':''].filter(Boolean).join(' · ')||'—')}</span></summary>
      <div class="body">
        <div><h4>Monitoraggio</h4><p>${esc(v.monitoraggio||'—')}</p></div>
        <div><h4>Operazioni consigliate</h4><p>${esc(v.operazioni||'—')}</p></div>
        ${v.foto?.length?`<div><h4>Foto</h4><div class="thumbs">${v.foto.map((p,i)=>`<img loading="lazy" data-pid="${esc(p.id)}" alt="${esc(p.caption||'Foto '+(i+1))}">`).join('')}</div></div>`:''}
        <div class="note">${v.email?'Email cliente: '+esc(v.email):'Email cliente mancante'}${v.telefono?' · Cell: '+esc(v.telefono):''}${v.inviataIl?' · <span class="sent">inviato il '+esc(new Date(v.inviataIl).toLocaleString('it-IT'))+'</span>':''}</div>
        <div class="btns">
          <button class="btn primary" data-act="send">Invia al cliente</button>
          <button class="btn" data-act="pdf">Scarica PDF</button>
          ${v.foto?.length?'<button class="btn" data-act="fotopdf">Scarica foto</button>':''}
          <button class="btn" data-act="edit">Modifica</button>
          <button class="btn danger" data-act="del">Elimina</button>
        </div>
        <div class="confirm" data-confirm hidden>Eliminare questa visita? <button class="btn danger" data-act="delyes" style="flex:none">Sì, elimina</button><button class="btn ghost" data-act="delno" style="flex:none">Annulla</button></div>
      </div>
    </details>`).join('');
  list.querySelectorAll('details[open]').forEach(d=>hydrateThumbs(d));
}
// le miniature dell'archivio si caricano quando si apre la scheda
$('list').addEventListener('toggle', e=>{ if(e.target.open) hydrateThumbs(e.target); }, true);
$('list').addEventListener('click', async e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const det=b.closest('details'); const v=visite.find(x=>x.id===det.dataset.id); if(!v) return;
  const act=b.dataset.act; const conf=det.querySelector('[data-confirm]');
  if(act==='del'){ conf.hidden=false; return; }
  if(act==='delno'){ conf.hidden=true; return; }
  if(act==='delyes'){ try{ if(editingId===v.id) resetForm(); await deleteVisit(v.id); toast('Visita eliminata.'); }catch(err){ toast('Eliminazione non riuscita.'); } return; }
  doAct(act, v);
});
$('q').addEventListener('input', render);
$('firma').addEventListener('input', ()=>ls.set('firma', $('firma').value));

/* ---------- schede ---------- */
function tab(t){ const n=t==='new'; $('pNew').hidden=!n; $('pArc').hidden=n; $('tNew').setAttribute('aria-selected', n); $('tArc').setAttribute('aria-selected', !n); if(!n) showLastBackup(); }
$('tNew').onclick=()=>tab('new'); $('tArc').onclick=()=>tab('arc');

/* ---------- installazione ---------- */
let installEvt=null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
function offerInstall(){
  if(standalone() || ls.get('noInstall',0) > Date.now()) return;
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(installEvt){
    $('insText').textContent='Aggiungi Report Vigneto alla schermata Home: si apre come un\'app, a tutto schermo, e funziona anche senza campo in vigneto.';
    $('insOk').hidden=false;
  } else if(isIOS){
    $('insText').textContent='Per averla come app su iPhone: in Safari tocca il pulsante Condividi (il quadrato con la freccia in su), poi "Aggiungi alla schermata Home". Funziona anche senza campo in vigneto.';
    $('insOk').hidden=true;
  } else return;
  $('install').hidden=false;
}
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); installEvt=e; offerInstall(); });
$('insOk').onclick=async()=>{ $('install').hidden=true; if(!installEvt) return; installEvt.prompt(); try{ await installEvt.userChoice; }catch(e){} installEvt=null; };
$('insNo').onclick=()=>{ $('install').hidden=true; ls.set('noInstall', Date.now()+7*864e5); };

/* ---------- avvio ---------- */
async function init(){
  $('firma').value = ls.get('firma', FIRMA_DEFAULT);
  const draft = ls.get('bozza', null);
  if(draft){
    FIELDS.forEach(f=>{ if(draft[f]!=null) $(f).value=draft[f]; });
    photos = Array.isArray(draft.foto) ? draft.foto : [];
    editingId = draft.editingId || null;
  }
  renderRighe(draft?.righe?.length ? draft.righe : [{}]);
  if(!$('data').value) $('data').value = today();
  try{
    await loadVisite();
    if(editingId && visite.some(v=>v.id===editingId)){ $('editNote').hidden=false; $('saveBtn').textContent='Salva modifiche'; } else editingId=null;
    // foto della bozza che non sono più nell'archivio (es. dati cancellati dal browser)
    const have=new Set(await idb.keys('foto')); photos=photos.filter(p=>have.has(p.id));
    renderPhotos(); cleanupPhotos();
    let persist=false; try{ persist = await navigator.storage?.persist?.(); }catch(e){}
    $('status').textContent = 'Archivio sul telefono, funziona anche senza connessione.'+(persist?'':' Ricordati di fare un backup ogni tanto (in Archivio).');
  }catch(e){
    renderPhotos();
    $('status').textContent = 'Archivio non disponibile su questo browser: '+(e?.message||'errore')+'. Se sei in navigazione privata, aprila in una finestra normale.';
    $('status').style.color='var(--danger)';
  }
  logoData();
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)) setTimeout(offerInstall, 1500);
}
if('serviceWorker' in navigator && location.protocol!=='file:'){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
init();
