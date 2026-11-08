# Archivio condiviso con accesso (Supabase)

Con questa configurazione ogni persona entra con **email e password**, e tutte le visite e le foto finiscono in **un unico archivio** che tutti vedono, da qualsiasi telefono. L'app continua a funzionare anche senza campo: le visite si salvano sul telefono e vengono inviate appena torna la connessione.

Chi può fare cosa:

| | Utente | Amministratore |
| --- | --- | --- |
| Vedere tutte le visite e le foto | sì | sì |
| Creare nuove visite | sì | sì |
| Modificare / eliminare le **proprie** visite | sì | sì |
| Modificare / eliminare le visite **degli altri** | no | sì |
| Inviare il report al cliente, scaricare PDF ed Excel di qualsiasi visita | sì | sì |

I nomi dei pulsanti di Supabase possono cambiare leggermente nel tempo: se qualcosa non corrisponde, cerca la voce più simile.

## 1. Creare il progetto (una volta sola)

1. Vai su **https://supabase.com**, scegli **Start your project** e accedi (va bene anche con GitHub).
2. **New project**: dai un nome (es. `report-vigneto`), scegli una **password del database** (conservala), e come **Region** un'area europea (es. *West EU* o *Central EU*). I dati dei clienti restano così in Europa.
3. Premi **Create new project** e aspetta un paio di minuti.

## 2. Creare le tabelle e le regole

1. Nel menu a sinistra apri **SQL Editor** → **New query**.
2. Apri il file `supabase/schema.sql` di questo repository, copia tutto il contenuto e incollalo.
3. Premi **Run**. Deve comparire *Success. No rows returned*. Si può rilanciare senza problemi.

## 3. Chiudere le registrazioni libere

Solo chi crei tu deve poter entrare.

1. **Authentication** → **Sign In / Providers** (o **Providers**) → **Email**.
2. Disattiva **Allow new users to sign up** e salva.

## 4. Creare gli utenti

Per ogni persona (te compreso):

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Scrivi email e una password iniziale, spunta **Auto Confirm User**, conferma.
3. Comunica a ciascuno email e password. Dall'app (Archivio → Account → *Cambia password*) ognuno può scegliersene una sua.

Per cambiare una password dimenticata: **Authentication** → **Users** → i tre puntini accanto all'utente → impostane una nuova.

## 5. Nominare gli amministratori

1. **SQL Editor** → **New query**, incolla il contenuto di `supabase/primo-admin.sql`.
2. Sostituisci `TUA-EMAIL@esempio.it` con l'email dell'utente da rendere amministratore e premi **Run**. Ripeti per ogni amministratore.

## 6. Collegare l'app

1. **Project Settings** (ingranaggio) → **API** (o **Data API** / **API Keys**).
2. Copia **Project URL** (tipo `https://abcdefgh.supabase.co`) e la chiave **anon public** (oppure **publishable**). Non copiare mai la chiave `service_role` / `secret`.
3. Apri `config.js` in questo repository e incolla i due valori tra gli apici:

```js
window.REPORT_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'la-chiave-pubblica'
};
```

La chiave pubblica è fatta per stare nel codice: i dati sono protetti dalle regole del database (passo 2) e dall'accesso con password.

Dopo il salvataggio e la pubblicazione (GitHub Pages) l'app, aperta da un telefono, mostra la schermata di accesso.

## 7. Sui telefoni

Apri l'indirizzo dell'app, accedi con email e password, poi installa l'app (Android: **Installa**; iPhone: Condividi → **Aggiungi alla schermata Home**). Il primo accesso richiede connessione; dopo si può lavorare anche senza campo.

Nella scheda **Archivio**, la sezione **Account e archivio condiviso** mostra a che ora è stato aggiornato l'archivio, quante modifiche aspettano di essere inviate, e ha i pulsanti **Sincronizza ora** ed **Esci**. Uscendo, i dati vengono tolti dal telefono (si riscaricano all'accesso successivo).

## Cose da sapere

- **Piano gratuito:** 500 MB di database e 1 GB per le foto. Le foto pesano circa 0,4–0,8 MB l'una, quindi 1 GB sono oltre 1.500 foto. Un progetto gratuito che resta **senza alcun uso per una settimana viene messo in pausa**: si riattiva con un clic dalla pagina del progetto e i dati restano. Il piano a pagamento non va in pausa e include i backup giornalieri.
- **Backup:** sul piano gratuito non ci sono backup automatici. Conviene esportare ogni tanto l'Excel dall'Archivio (contiene tutte le visite e le miniature delle foto).
- **Foto:** le foto di una visita sono visibili a tutti gli utenti collegati; non esiste un link pubblico.
- **Modifiche contemporanee:** se due persone modificano la stessa visita (autore e amministratore) nello stesso momento, vale l'ultima inviata.
