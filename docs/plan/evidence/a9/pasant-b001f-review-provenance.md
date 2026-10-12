# PASANT-B001f — provenance of the two accepted A9 port review requests

Ledger item PASANT-B001f (derived from PASANT-B001 under approved plan PASANT revision 1; parent outcomes C001–C003
stay open), order PASANT-07 r0. This is a test and evidence repair. It changes no runtime, schema, UI, config or
provider path, and it closes neither B001 nor A9.

## 1. Why two forms exist

PASANT-B001d's review request was written twice, once per accepted PASANT-05 round:

- **Original (r0).** Written at `a81338a95a31c6748a6c6b1bb64c658d599be234` on `ws/pasant-as`, independently reviewed
  APPROVED and committed locally (closure `12ca52a059d1`). PASANT-06 (closure `a24d829d09f3`, accepted at
  `83a8b7a469c75fd89a60b095f7334a874dda5d32`) then pinned its SHA-256 in `__tests__/lib/pasantias/january-contract.test.ts`
  as prior accepted evidence.
- **Rebuild (r1).** r0 could not apply to `main`, so PASANT-05 r1 rebuilt the port on `main` and wrote a new review
  request at the same path. It was accepted at `21f4aa7dcc52ddacf8ac3ad4b2e0acb5c920f3d2` on `fix/pasant05-main`
  (closure `aa8e8245fc7b`) and is in release `rel/genera-10091510` (PR #161) at
  `3234eb8d1956d2af22be29768f03745cc83afe9c`.

On the combined release, the PASANT-06 pin met the r1 file. PR #161's unit gate failed at
`january-contract.test.ts:876` (1 failed, 13223 passed, 12 skipped). Neither acceptance was wrong. One path cannot
hold two different accepted files.

## 2. Mapping

| Form | Path on this tree | SHA-256 | Git blob | Accepted commit | Binding commit |
|---|---|---|---|---|---|
| original | `docs/plan/evidence/a9/pasant-b001d-original-review-request.md` | `c516ad807f8a25ce89af838c824979145e9344c346ed08b175299a2a6dceaa5f` | `90c6124f38d1d69767c8694ed7dd08b3e62249ad` | `a81338a95a31c6748a6c6b1bb64c658d599be234` | `83a8b7a469c75fd89a60b095f7334a874dda5d32` |
| rebuild | `docs/planning/reviews/fase-pasant-a9-port-review-request.md` | `a22f8aa0495a6cf4c869014f79b0b441fca61b281ac47aa60e1a7f0a451bb710` | `e554b91bcfd92340494c0070860773ac9cd80949` | `21f4aa7dcc52ddacf8ac3ad4b2e0acb5c920f3d2` | `3234eb8d1956d2af22be29768f03745cc83afe9c` |

"Accepted commit" is where each round was accepted. "Binding commit" is where that form was bound: PASANT-06's pin
for the original, and the release candidate this repair is built on for the rebuild.

The archive holds the exact committed bytes of the original (5796 bytes; the rebuild is 5661). To reproduce:
`git show 83a8b7a469c75fd89a60b095f7334a874dda5d32:docs/planning/reviews/fase-pasant-a9-port-review-request.md | sha256sum`
gives the original's SHA-256, and `git hash-object` on the archive gives its blob. The same blob is at
`a81338a95a31c6748a6c6b1bb64c658d599be234`. Both forms are unedited. The review path keeps the r1 bytes released at
`3234eb8d1956d2af22be29768f03745cc83afe9c`. The rebuild names its source itself: it says it rebuilds PASANT-05 r0
(`a81338a95` on `ws/pasant-as`, closure `12ca52a059d1`) and that r0's review, closure and evidence are unchanged.

## 3. What each form attests

The rebuild is a later, separate review request, not the original. It attests to the r1 port on base
`1e19b849674294475a9cf42410c29b5afc5b1d7e`, with 24 mandatory entries. The original attests to the r0 port on
`c1f498efb250cd4c5ff53bdbc6d6616ab3dac3b2`, with 22 entries. The original's acceptance is evidenced only by the
archived bytes and the two original commits. Matching the rebuild proves nothing about the original.

`__tests__/lib/pasantias/january-contract.test.ts` pins both rows of §2 from its own constants, not from this file.
It requires this file to repeat each row and these statements. It fails for a missing or edited archive, a review
path that is not the r1 rebuild, a rebuild that drops its link to r0, a row here that is missing or swapped, and any
corruption of the other retained files.
