// Collegamento all'archivio condiviso (Supabase). Vedi SETUP.md.
// Finché i due valori restano vuoti l'app funziona solo sul singolo telefono, senza accesso.
// La "chiave pubblica" (anon / publishable) è fatta per stare qui: i dati sono protetti dalle regole del database.
window.REPORT_CONFIG = {
  supabaseUrl: '',   // es. https://abcdefgh.supabase.co
  supabaseKey: ''    // chiave "anon public" oppure "publishable"
};
