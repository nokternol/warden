# Warden — purpose and intent

**North star. Only the owner changes this document.** It says why Warden exists, what it believes
and what it must never become. It does not describe how Warden is built; `docs/architecture/` does
that. Every plan, review finding and fix is judged by whether it moves Warden toward what is written
here.

## Purpose

A media server owner runs several services: one that manages their films, one that manages their
series, a media server their users watch on, a watch-history tracker, a request manager where users
ask for titles. Each service knows something the others don't, and each can do something the others
can't.

The owner wants to act in one service based on what other services know. For example:

> Delete films that were added from a list, that nobody has watched in 90 days, and that are on no
> user's wishlist.

"Added from a list" is known by the film manager. "Nobody has watched in 90 days" is known by the
watch-history tracker or the media server. "On no user's wishlist" is known by the request manager.
The deletion happens in the film manager. No single service can answer the question or carry out the
action alone.

**Warden is the warden of the media: it lets the owner state a condition over what any of their
services know, and act in any service on the titles that meet it.** It does not decide what the owner
should do. It makes whatever they decide possible, safe and repeatable.

## Beliefs

1. **The owner composes; Warden does not predict.** Warden does not know which tasks owners will
   want, and does not try to. It offers building blocks: facts about titles, conditions over those
   facts that combine freely, and actions services can perform. Owners assemble them. A capability
   built for one scenario, instead of as a building block every scenario can use, moves away from
   this.

2. **Any fact can drive any action.** A fact from any connected service can select titles for an
   action in any other connected service. Where a fact can be used, and where an action can be taken,
   depends only on whether the services can address the same title, never on which services they
   are.

3. **Knowing that items in different services are the same title is Warden's core value.** Each
   service names titles its own way. Warden's job is to know that the film manager's item, the media
   server's item, the watch-history entry and the request are one title. Without that, belief 2 is
   impossible. Everything that needs to know "is this the same title" gets the same answer.

4. **The services own the truth. Warden holds a copy for speed, never as the truth.** The owner's
   services are the record of what exists and what is known about it. Warden keeps a copy so it can
   answer quickly across services. That copy can be thrown away and rebuilt from the services at any
   time, without losing anything the owner made. There is one copy: the services' data, stored in
   Warden's database and kept up to date with the services on the owner's schedule. Every part of
   Warden answers from it. A cache serves that copy from memory, so the many reads and the
   scheduled mass writes need no complex database indexing; the cache is never a second source of
   answers.

5. **Warden owns only what the owner makes in it:** their connections to services, their conditions,
   their automations and the history of what Warden did. These are the only things Warden must never
   lose.

6. **Warden's knowledge is a cache, stale by design, and says so.** Warden does not own the data,
   so what it knows is always as of its last refresh from the services. Refreshing is itself
   scheduled work, done by the same automation mechanism that gives Warden its value, so how fresh
   Warden is can be seen and set by the owner. Wherever Warden shows or uses what it knows, it is
   clear how current that is. Queries answer quickly from the cache: the matches they show are what
   the cache holds now, not a promise of what a scheduled run will act on later. Warden does not
   hold back actions, add manual steps or demand fresh data to work around staleness. Warden
   believes what a service answers. A successful answer is that service's truth, even when it is
   empty; only an error or no answer is a failure, and then Warden keeps what it last had. Warden
   does not guess whether a successful answer is wrong.

7. **Destructive actions are the owner's choice, and accountable.** The owner can schedule any
   action, destructive ones included, and accepts the risk of it acting on the cache as it stands
   when the run happens. Warden trusts the owner's conditions and never decides for them whether an
   action may run because of how much it would affect. It makes it clear when an action is
   destructive, and warns well before the schedule reaches it when a destructive action would
   affect a large share of the library, so the owner can review it. What an automation would act on
   now is always one step away, so the owner can review it whenever they choose; reviewing is never
   required. Warden does not run a destructive action when a service it depends on failed to
   answer, because that is far more likely a fault than the owner's intent. A service that has
   never been read counts as one that failed to answer. A fact that another connected service
   still supplies does not depend on the one that failed. Afterwards, Warden can always say what it did, to which
   titles and when, even after those titles are gone from every service.

8. **One meaning per idea.** Each idea in Warden has one name and one way of working, the same in what
   the owner sees, in how services are reached, and in how Warden is built. Two ways of answering one
   question is a defect, however well each works.

9. **Adding a service adds what Warden knows and can do, and changes nothing else.** A new service
    brings new facts and new actions into the same building blocks. It does not need new kinds of
    condition, new kinds of automation, or special cases elsewhere.

## Constraints

- **Self-hosted and owner-run.** Warden runs beside the owner's own services, for one owner, who
  claims it on first sign-in.
- **Warden never changes a service except through an action the owner set up.** It reads freely; it
  writes only when the owner's automation says so.
- **Warden is not a media manager.** It does not replace any service's own job (finding, downloading,
  playing, requesting). It coordinates across them.

## Using this document

For any review finding, plan or fix, ask which belief it serves or breaks, and choose the shape that
keeps all of them. A fix that removes a symptom but breaks a belief is the wrong fix. If two readings
of a belief lead to different work, or a belief says nothing about a decision that has to be made,
ask the owner and sharpen this document before building.
