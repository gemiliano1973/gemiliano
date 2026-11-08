'use strict';
// Collegamento all'archivio condiviso (Supabase): accesso, visite e foto.
// Se config.js è vuoto l'app resta "solo sul telefono" e questo file non fa nulla.
(function(){
  const cfg = window.REPORT_CONFIG || {};
  const Cloud = { enabled: !!(cfg.supabaseUrl && cfg.supabaseKey), error: '' };
  window.Cloud = Cloud;
  if(!Cloud.enabled) return;
  if(!window.supabase || !window.supabase.createClient){ Cloud.enabled = false; Cloud.error = 'La libreria di collegamento non si è caricata.'; return; }

  const KEY = 'report-vigneto-auth';
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: KEY }
  });

  const fail = (e, fallback) => { const x = new Error((e && e.message) || fallback || 'errore'); x.code = e && (e.code || e.status || e.statusCode); x.name = (e && e.name) || 'Error'; return x; };
  // errore di rete (niente campo, server non raggiungibile) e non un rifiuto del server
  Cloud.isNetworkError = e => !!e && (e.name === 'AuthRetryableFetchError' || /fetch|network|timeout|timed out|failed to|load failed|offline|abort/i.test(String(e.message || e)));

  Cloud.getSession = async () => {
    try{
      const { data, error } = await sb.auth.getSession();
      return data && data.session ? { session: data.session } : { session: null, error };
    }catch(e){ return { session: null, error: e }; }
  };
  Cloud.login = async (email, password) => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw fail(error, 'accesso non riuscito');
    return data.session;
  };
  Cloud.logout = async () => {
    try{ await sb.auth.signOut({ scope: 'local' }); }catch(e){}
    try{ localStorage.removeItem(KEY); localStorage.removeItem(KEY + '-code-verifier'); }catch(e){}
  };
  Cloud.changePassword = async password => {
    const { error } = await sb.auth.updateUser({ password });
    if(error) throw fail(error, 'password non cambiata');
  };
  // true se l'utente collegato è nell'elenco degli amministratori (la tabella mostra a ciascuno solo la propria riga)
  Cloud.isAdmin = async () => {
    const { data, error } = await sb.from('amministratori').select('user_id');
    if(error) throw fail(error);
    return (data || []).length > 0;
  };

  Cloud.list = async () => {
    const out = [], PAGE = 500;
    for(let from = 0; ; from += PAGE){
      const { data, error } = await sb.from('visite').select('id,doc').order('id').range(from, from + PAGE - 1);
      if(error) throw fail(error);
      out.push(...data);
      if(data.length < PAGE) break;
    }
    return out;
  };
  Cloud.upsert = async row => {
    const { error } = await sb.from('visite').upsert(row, { onConflict: 'id' });
    if(error) throw fail(error);
  };
  Cloud.remove = async id => {
    const { data, error } = await sb.from('visite').delete().eq('id', id).select('id');
    if(error) throw fail(error);
    if(!data || !data.length){
      // 0 righe: già eliminata, oppure non è permesso (le regole del database lo fanno tacere)
      const chk = await sb.from('visite').select('id').eq('id', id);
      if(chk.error) throw fail(chk.error);
      if(chk.data && chk.data.length) throw new Error('puoi eliminare solo le tue visite');
    }
  };

  Cloud.upload = async (path, blob, contentType = 'image/jpeg') => {
    const { error } = await sb.storage.from('foto').upload(path, blob, { contentType, upsert: false });
    if(!error) return;
    const m = [error.message, error.error, error.statusCode, error.status].join(' ');
    if(/already exists|duplicate|\b409\b/i.test(m)) return;   // caricata in un invio precedente
    throw fail(error, 'foto non caricata');
  };
  Cloud.download = async path => {
    const { data, error } = await sb.storage.from('foto').download(path);
    if(error) throw fail(error, 'foto non scaricata');
    return data;
  };
  // indirizzo temporaneo, apribile da chiunque lo riceva (es. il cliente) finché non scade
  Cloud.signedUrl = async (path, seconds) => {
    const { data, error } = await sb.storage.from('foto').createSignedUrl(path, seconds);
    if(error) throw fail(error, 'link non creato');
    return data.signedUrl;
  };
  // PDF inviati ai clienti per una visita (stanno in <utente>/pdf/<id visita>-...)
  Cloud.listPdfs = async (folder, visitId) => {
    const { data, error } = await sb.storage.from('foto').list(folder + '/pdf', { search: visitId, limit: 100 });
    if(error) throw fail(error);
    return (data || []).filter(f => f.name.startsWith(visitId + '-')).map(f => folder + '/pdf/' + f.name);
  };
  Cloud.removeFiles = async paths => {
    const { error } = await sb.storage.from('foto').remove(paths);
    if(error) throw fail(error);
  };
})();
