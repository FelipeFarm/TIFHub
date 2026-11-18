import { clientInterested, dismissOffer } from "@/app/actions";
import { OFFER_CARDS, SERVICE_NAMES, type OfferService } from "@/lib/offers";

/** Home: what they have, and up to 2 other services. Server-rendered forms, no client script needed. */
export function ServicesCard({ have, offers }: { have: OfferService[]; offers: OfferService[] }) {
  if (!have.length && !offers.length) return null;
  return (
    <div className="card">
      <h2>Your services</h2>
      {have.length > 0 && (
        <div className="svc-have">
          {have.map((s) => (
            <span key={s}>{SERVICE_NAMES[s]}</span>
          ))}
        </div>
      )}
      {offers.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>
            Also from The Idea Farm
          </div>
          {offers.slice(0, 2).map((s) => (
            <div className="offer" key={s}>
              <b>{SERVICE_NAMES[s]}</b>
              <p>{OFFER_CARDS[s]}</p>
              <div className="row">
                <form action={clientInterested}>
                  <input type="hidden" name="service" value={s} />
                  <input type="hidden" name="trigger" value="home" />
                  <button className="btn sm ghost">I&apos;m interested</button>
                </form>
                <form action={dismissOffer}>
                  <input type="hidden" name="service" value={s} />
                  <input type="hidden" name="back" value="/" />
                  <button className="linkbtn">Not now</button>
                </form>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Right after a request is sent, when it points to a service they don't have. */
export function Suggestion({ s, requestId }: { s: { service: OfferService; title: string; body: string }; requestId: number }) {
  return (
    <div className="suggest">
      <small>An idea for this</small>
      <b>{s.title}</b>
      <p>{s.body}</p>
      <div className="row">
        <form action={clientInterested}>
          <input type="hidden" name="service" value={s.service} />
          <input type="hidden" name="trigger" value="after_request" />
          <input type="hidden" name="requestId" value={requestId} />
          <button className="btn sm">Tell me more</button>
        </form>
        <form action={dismissOffer}>
          <input type="hidden" name="service" value={s.service} />
          <input type="hidden" name="trigger" value="after_request" />
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="back" value={`/requests/${requestId}`} />
          <button className="btn sm ghost">No thanks</button>
        </form>
      </div>
    </div>
  );
}
