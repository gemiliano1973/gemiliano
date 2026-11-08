-- Rende amministratore un utente già creato (cambia l'email qui sotto, poi Run).
insert into public.amministratori (user_id)
select id from auth.users where email = 'TUA-EMAIL@esempio.it'
on conflict do nothing;
