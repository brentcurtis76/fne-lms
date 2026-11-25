# GENERA fixes, third release of 24 Nov: an awarded or closed tender is never deleted and the Carta is signed by the legal representative, and contract files open only through five-minute links

Branch: `fix/f2426`. Base: `6a336e70e` (main, 24 Nov 2026, pull request 212: the fixes' second release of 24 Nov, the contract text's version and the filler RUT refused).
A straight line of commits on main, no merge commits: 9 commits of two builds of two phases (F24a, Licitaciones' held items: 6 commits; F26a, contract files behind five-minute links: 3 commits), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data). This release holds one build of each of two phases, both with the owner's product answers:

- Licitaciones (F24a, LIC-B7 and the held items): the Carta de adjudicación is signed by the «Representante legal» with the sostenedor's legal name (20 Nov 2026); a new tender opens without the client's notary data ("Yes, open without", 20 Nov; the escritura date and the notary are never obligatory, 17 Nov), while whatever the page does about a missing representative's RUT stays as it is (tenders were left out of the RUT changes, 24 Nov); an awarded or closed tender cannot be deleted ("No, keep it off", 20 Nov), and closed archive records are never deleted either (20 Nov).
- Contract files (F26a, N85 and N146): "five-minute links in code, and Yes, I flip it too" (20 Nov 2026): the code opens contract files only through short-lived links, and the owner switches the `contracts` store to private by hand once this is live.

The rest of F24 (the route's historical exception, the remaining held items) and of F26 (feed images, message attachments) is not in this release.

## What changes

**Tenders (admins; Licitaciones)**
- An awarded or closed tender (states `contrato_pendiente`, `contrato_generado`, `adjudicada_externo`, `cerrada`) can no longer be deleted through a user session: a new database rule refuses the delete, so an admin's direct request deletes nothing. The server route keeps its own state rule and answers as before («La licitación ya fue adjudicada: no se puede eliminar.», 409).
- The tender page offers «Eliminar» only before the award. It never offers it for an awarded or closed tender, historical archive records included, whatever the historical check answers (success, error, a request that never answers) and after moving between tenders. Before the award an admin deletes as before, after the same confirmation question.
- The Carta de adjudicación is signed by the client's legal representative: under the line it prints the representative's name in bold, «Representante legal» and the sostenedor's legal name; it no longer prints «Director(a) del <colegio>». With either value missing it prints «[nombre representante legal]» or «[nombre legal del sostenedor]». The Bases and the Acta are not changed. A Carta already generated is not rewritten; the next one generated is right.
- «Nueva Licitación» no longer shows «El cliente no tiene toda la informacion legal requerida. …» when the client lacks only the notary's name or the escritura date. A client without a representative's name or RUT still shows the same sentence, unchanged. A school without a linked client is still refused with «Esta escuela no tiene un cliente vinculado. Vincule un cliente antes de crear la licitación.» (unchanged, confirmed by the blind test).

**Contract files (admins; Contratos and the print page)**
- A signed contract uploaded from Contratos and the original PDF of an imported contract are stored by their file name in the `contracts` store, no longer as a permanent public address.
- Every place that opens a contract file («Ver documento firmado», «PDF» of an imported contract, «Descargar documento original» on the print page) asks the new route `pages/api/contracts/contract-link.ts`, which signs a link valid for five minutes for an active admin only (`Cache-Control: no-store`). Anyone else gets the same answer for an existing and an unknown contract (404 «Contrato no encontrado»; 401 «No autorizado» for a visitor), so nothing tells whether a contract has a file. Contracts stored before this release with a full public address of this project's store open through the same route without any row being rewritten.
- If the browser blocks the new tab, a message says «El navegador bloqueó la ventana. Permite las ventanas emergentes para ver el documento.»
- The route logs fixed texts only, never an error's message (an error from the store can carry the file's name).
- Only an active admin can upload into the `contracts` store; before, nobody could (the store had no permissive upload rule, so every upload was refused).
- It works with the store public or private; the screens and the route behave the same in both.

## Database

Two migrations, add-only, no function:
- `supabase/migrations/20261124140000_licitaciones_awarded_not_deleted.sql`: one new rule `licitaciones_awarded_not_deleted` on `public.licitaciones`, RESTRICTIVE, FOR DELETE, `estado <> ALL (ARRAY['contrato_pendiente', 'contrato_generado', 'adjudicada_externo', 'cerrada'])`, with its comment. It is ANDed with the existing rules, which stay; SELECT, INSERT and UPDATE are untouched. The server's service key keeps BYPASSRLS, so the route decides as before.
- `supabase/migrations/20261124141000_contracts_store_admin_upload.sql`: one new rule `contracts_admin_insert` on `storage.objects`, PERMISSIVE, FOR INSERT TO authenticated, `bucket_id = 'contracts' AND public.auth_is_admin()`. No read, update or delete rule is added; the store is not created or changed.

No policy or rule of earlier releases is touched, no row is changed, nothing is dropped. Neither migration defines a function, so no function of this release deletes rows and `.pm-publish/solo-preflight.json` declares none (it is unchanged: no checks, no declarations). The publisher's own reading of both files: no static problem; one storage rule (`contracts_admin_insert`) and no store, trigger or function of Supabase's side. Every rule survives a dump and rebuild (1,082 rules, 0 different).

Recovery without a destructive statement: either rule can be changed in place (`ALTER POLICY`) to let everything through again; nothing else depends on them.

## Proof

On `4e5a99251`: database tests 115 files / 10,909 (the new files `166-licitaciones-awarded-not-deleted.sql` and `178-contracts-store-upload.sql` among them); rebuild check 0 of 1,082 rules different; type check; lint; unit suite 811 files, 22,410 tests passed (1 file and 19 tests skipped); CI's browser tests 353 passed, the 32 mandatory specs ran with no skips (an earlier run did not start because its port was taken by another run on the laptop).

Each build was read by a second model until it had nothing left (F24a: three reads with changes asked about the «Eliminar» condition, then one different approach, «Eliminar» no longer depending on the historical check at all, approved at the fourth read; F26a: two reads, one send-back for the route's logging, approved). Both builds were tested blind together by a third model through real requests: tenders, scenarios 1 to 8, all passed (the Carta's signature; the Bases and Acta without «Director(a)»; a tender for a client without notary data created; a school without a linked client refused; the route and the direct database delete refused for awarded and closed tenders, rows and documents kept; a pre-award tender deleted; an encargado refused); contract files, scenarios 1 to 6, all passed in two runs, the store public and the store private (uploads by an admin, refused for a docente and a visitor; five-minute links that stop working after expiry; identical refusals for other roles; an older contract's PDF through the route; only names stored).

## What a reviewer should look at first

1. The two migrations: the restrictive delete rule's states, and that the storage rule names only `contracts` and only insert.
2. `pages/api/contracts/contract-link.ts` and `lib/contracts/contract-path.ts`: the admin check before the contract is read, the name kept inside `contracts` (traversal and encoded separators refused), the 300 seconds, the same answer for an unknown contract and one without a file, the fixed log texts.
3. `pages/contracts.tsx`, `lib/contracts/open-contract.ts` and `pages/contract-print/[id].tsx`: both upload spots store the name and call no public address; every opening goes through the route.
4. `pages/licitaciones/[id].tsx`: the «Eliminar» condition (`puedeEliminarLicitacion(estado, false)`).
5. `lib/cartaGenerator.ts` and `pages/api/licitaciones/[id]/generate-carta.ts` (the signature block and the legal name), `pages/licitaciones/nueva.tsx` (the client check).

## Known and left for later

- The `contracts` store is still public in Production. After this release is live the owner switches it to private by hand (his decision of 20 Nov 2026). Until then, a file whose name is known can still be read at its permanent public address, as today; the platform no longer shows or stores such an address for new files.
- The tender route still has its exception for a historical archive record (`lib/licitaciones/estados.ts`): the page no longer offers «Eliminar» for it, and the one-line change to the route belongs to a later build of F24.
- The Clientes form shows a raw database error («Error al guardar cliente: null value in column "nombre_notario" of relation "clientes" violates not-null constraint», the same for «fecha_escritura») when the notary's name or the escritura date is blanked, also on a complete client; nothing is saved. Older than this release, found by the browser pass.
- The red sentence in «Nueva Licitación» sends the person to «la seccion de Escuelas», while the client is edited in Gestión → Clientes (the wording is unchanged on purpose).
- A tender page whose detail load fails keeps the earlier tender on screen until the redirect completes, with handlers that act on the new address's id (older than this release; with this release «Eliminar» remains only for pre-award tenders).
- `pages/api/contracts/invoice-link.ts` (live, outside this release) still logs the store's error messages, which can carry an invoice's file name.
- An older contract address on another host name than the project's own is refused (no evidence that such addresses were stored).
- Seen in the browser, not blocking: the tender list shows closed tenders while «Mostrar históricas (licitaciones cerradas)» is unticked; a Carta's temporary link lasts 3,600 seconds (the tenders store), longer than the contracts' 300; the print page refused to a docente logs «Error loading contract: Object» in the console.
- Everything listed under "Known and left for later" in the earlier requests of 17 to 24 Nov.

No credentials, no personal data in tests (invented people and companies only), no Production action by any agent.

## Used by sight

By a tester who had not seen the builds, in a real browser on invented local data, in two passes, the contracts part with the store public and again private.
- Tenders: no «Eliminar» on a pending-contract tender, a closed tender or a historical archive record, on first opening, after a reload, after browser back and forward and after coming from the list (watched every 25 ms while moving); a pre-award tender deleted after its question. The Carta's text read from the generated file ends with the representative's name, «Representante legal» and the legal name, no «Director»; the file itself, a .docx, was not shown by the browser. A client with an empty representative's RUT still shows the red sentence and the tender is created; a client lacking only the notary's name shows no red sentence. The `contrato_generado` and `adjudicada_externo` states had no seeded tender and were not looked at in the browser (the database test and the blind test cover them).
- Contract files: a signed contract uploaded to a pending contract made it «Activo» and «En Flujo de Caja»; one uploaded to a draft kept it «Borrador» with «Documento firmado guardado. El contrato sigue en borrador hasta que se active.»; «PDF» and «Ver documento firmado» opened new tabs at temporary signed addresses and displayed the document, in both runs; a copied address refused after six minutes; with the store private the permanent address answered 404; the blocked-window message seen (blocking simulated in the page); a docente and a visitor refused.
- Not seen by sight, and resting on unit tests: the PDF importer (the local copy has no PDF-reading service: «La lectura automática de PDF no está configurada. Ingrese los datos del contrato manualmente.») and a client lacking only the escritura date.
