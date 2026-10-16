# Report Vigneto – app per il telefono

App per compilare il report delle visite in vigneto, con le stesse funzioni del modulo "Report Visita Vigneto":

- modulo con data, azienda, località, vigna, varietà e superfici (con totale), email e cellulare del cliente, monitoraggio, operazioni consigliate
- fino a 12 foto per visita, scattate o prese dalla galleria, con didascalia
- compilazione automatica dall'ultima visita alla stessa azienda, vigna o varietà; testi già usati da riprendere
- PDF del report con logo Fitochimica e PDF delle foto (una per pagina)
- invio al cliente: menu di condivisione del telefono con i PDF già allegati (WhatsApp, Gmail…), oppure link a Gmail, WhatsApp e app di posta
- archivio con ricerca, modifica, eliminazione ed export Excel con le miniature delle foto
- funziona anche senza connessione; la bozza del modulo, foto comprese, resta salvata se chiudi l'app

Tutti i dati restano sul telefono (archivio del browser). Usa **Archivio → Esporta backup** ogni tanto e conserva il file: con **Importa backup** lo ricarichi su un telefono nuovo.

## Pubblicarla

È un'app web installabile (PWA): non serve nessuno store. Basta pubblicare questi file su un indirizzo `https`, ad esempio con GitHub Pages:

1. Su GitHub apri il repository → **Settings → Pages**.
2. In **Build and deployment** scegli **Deploy from a branch**, poi il branch e la cartella `/ (root)`, e premi **Save**.
3. Dopo un minuto l'app è su `https://<utente>.github.io/<repository>/`.

## Installarla sul telefono

- **Android (Chrome):** apri l'indirizzo e tocca **Installa** quando compare, oppure menu ⋮ → **Installa app**.
- **iPhone (Safari):** apri l'indirizzo, tocca **Condividi** → **Aggiungi alla schermata Home**.

## File

| File | Contenuto |
| --- | --- |
| `index.html` | struttura delle schermate |
| `style.css` | grafica |
| `app.js` | logica: archivio, foto, PDF, Excel, invio, backup |
| `sw.js` | funzionamento senza connessione |
| `manifest.webmanifest`, `icons/` | nome e icona dell'app |
| `vendor/` | librerie jsPDF 2.5.1 ed ExcelJS 4.4.0 |
