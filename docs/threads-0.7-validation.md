# Chamber 0.7.0 Threads Acceptance Matrix

Base release: `0.6.0`  
Candidate platform: Threads (`threads.com`, legacy `threads.net`)  
Stable website download remains `0.6.0` until every release gate below is accepted.

## Automated gates

| Area | Expected result | Status |
|---|---|---|
| Platform URL | Only `/@handle/post/<shortcode>` is accepted; profile and feed URLs are rejected | Automated |
| Legacy host | A `threads.net` permalink is accepted and canonicalized to `threads.com` | Automated |
| Shared backup validation | Text-only, image-only, multi-image and link-only video payloads follow the 0.6.0 contract | Automated |
| Author identity | Permalink author handle must equal the active Threads profile handle | Adapter contract; real-page acceptance required |
| Owner key continuity | Facebook and Threads bindings use the same Chamber profile `ownerUserId` and recovery material | Code review + regression tests |
| API boundary | Invalid Threads source URLs are rejected before upload | Automated/server syntax |
| Echo routing | Threads backups use `/echo/<alias>/threads`; `all` still combines platforms | Existing generic Echo path + build |
| Encryption/access | Per-post AES envelope, whole-timeline auto-unlock, single-post request/grant and 2-of-3 recovery remain platform-neutral | Existing access/recovery tests |
| Localization | Extension and website retain equal Traditional Chinese and English key sets | Automated |
| Stable release protection | Candidate build does not overwrite `chamber-extension.zip`, `latest.json`, or versioned 0.6.0 ZIP | Packaging check |

## Real Threads browser acceptance

Run in both Traditional Chinese and English UI where labels differ. Record the post URL/type and a screenshot for every failure.

| Scenario | Selection and preview | Backup and Echo | Status |
|---|---|---|---|
| Own text-only post | Exact post outlined; full paragraphs; author/time/permalink correct | Encrypted backup appears under Threads and auto-unlocks | Pending |
| Own single-image post without text | Image preview and permanent link; no false “empty” | Encrypted image renders after unlock | Pending |
| Own multi-image post | Every loaded image counted; incomplete carousel is blocked | All images decrypt; album viewer navigates each image | Pending |
| Own long collapsed post | Chamber expands or keeps backup disabled until refreshed content is complete | Echo preserves line breaks and never stores “See more” | Pending |
| Own video post | Text, permanent Threads URL and available poster shown; current version warning visible | Link/poster backup only; source opens correct post | Pending |
| Reply | Reply is selected only when it is the user's own canonical post; it never substitutes for the parent | Correct reply permalink and content | Pending |
| Quoted post | Clicking outer own text chooses outer post; clicking nested foreign quote is rejected | No quoted author's media/text is mixed into outer backup | Pending |
| Repost/foreign post | Authorship check rejects it | No transaction is created | Pending |
| Esc/cancel | Highlight, banner and click interception disappear immediately | Side Panel returns to selection-ready state | Pending |
| Re-select after DOM update | Same permalink refreshes the selected payload without changing post identity | Backup remains attached to the correct source | Pending |
| Reborn declaration | Threads composer opens with platform-specific text and card, or clearly asks for manual card attachment | User reviews and publishes manually | Pending |
| Existing Facebook Chamber account | Threads binds to the same alias/owner key | Facebook and Threads posts unlock in the same Echo identity | Pending |
| Fresh Threads-only account | Mapping, native owner key and recovery setup complete | Restore with A+C and B+C works | Pending |
| Reader request | A different Chamber identity requests one Threads post | Author approves; only that post unlocks | Pending |

## Release decision

Do not promote 0.7.0 while any data-integrity scenario is pending or failing: exact post identity, own-author verification, complete text, complete declared media, encryption, Echo visibility, or owner auto-unlock. Composer image auto-attachment may fall back to an explicit manual step, but it must never claim the card was attached when it was not.
