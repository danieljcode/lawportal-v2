// A case's plea and settlement offers (LP-229), newest first: when, from whom, the terms and what
// happened. A countered offer points to its counter-offer. Accepting one suggests closing the case
// with the matching outcome; it never closes it by itself. Each change saves the case straight away.

import { useState, type FormEvent } from "react";
import { caseStore } from "@/lib/cases";
import { formatDay, gameToday } from "@/lib/deadlines";
import {
  cleanOffer,
  cleanOffers,
  OFFER_FROM,
  OFFER_RESPONSES,
  offerOutcome,
  type Offer,
  type OfferFrom,
} from "@/lib/offers";
import { OUTCOME_LABELS } from "@/lib/outcomes";
import type { Case } from "@/lib/types";
import GameDateInput from "@/ui/GameDateInput";

const FROM_LABELS: Record<OfferFrom, string> = {
  prosecution: "Prosecution",
  defence: "Defence",
  plaintiff: "Plaintiff",
  defendant: "Defendant",
};
const RESPONSE_LABELS: Record<Offer["response"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  countered: "Countered",
};

const describe = (o: Offer) => formatDay(o.date) + ", from the " + FROM_LABELS[o.from].toLowerCase();

function focusOffer(id: string): void {
  const el = document.getElementById("offer-" + id);
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.scrollIntoView?.({ block: "nearest" });
  el.focus({ preventScroll: true });
}

export default function CaseOffers({ c }: { c: Case }) {
  const offers = c.offers || [];
  const [date, setDate] = useState(gameToday);
  const [from, setFrom] = useState<OfferFrom>("prosecution");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  /** The offer just accepted, while its "close the case" suggestion shows. */
  const [suggest, setSuggest] = useState<Offer | null>(null);

  const save = (next: Partial<Case>): boolean => {
    try {
      caseStore().save({ ...c, ...next });
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const saveOffers = (list: Offer[]) => save({ offers: cleanOffers(list) });
  const change = (o: Offer, patch: Partial<Offer>) => {
    const next = { ...o, ...patch };
    if (!saveOffers(offers.map((x) => (x.id === o.id ? next : x)))) return;
    if (patch.response) setSuggest(patch.response === "accepted" && c.status !== "Closed" ? next : null);
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const o = cleanOffer({ date, from, terms });
    if (!o) {
      setError(terms.trim() ? "Pick a date." : "Write the terms, like Plead to one count, 6 months.");
      return;
    }
    if (saveOffers([o, ...offers])) setTerms("");
  };

  const close = (o: Offer) => {
    if (save({ status: "Closed", outcome: { result: offerOutcome(o), date: o.date, note: o.terms } })) setSuggest(null);
  };

  return (
    <>
      {offers.length ? (
        <ul className="offer-list" id="offer-list">
          {offers.map((o) => {
            const counter = o.counter ? offers.find((x) => x.id === o.counter) : undefined;
            return (
              <li key={o.id} id={"offer-" + o.id} className={"offer offer-" + o.response}>
                <p className="small muted">{describe(o)}</p>
                <p className="offer-terms">{o.terms}</p>
                <div className="row offer-controls">
                  <select
                    aria-label={"What happened to the offer of " + describe(o)}
                    value={o.response}
                    onChange={(e) =>
                      change(o, {
                        response: e.target.value as Offer["response"],
                        ...(e.target.value === "countered" ? {} : { counter: undefined }),
                      })
                    }
                  >
                    {OFFER_RESPONSES.map((r) => (
                      <option key={r} value={r}>
                        {RESPONSE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {o.response === "countered" && (
                    <select
                      aria-label="The counter-offer"
                      value={o.counter || ""}
                      onChange={(e) => change(o, { counter: e.target.value || undefined })}
                    >
                      <option value="">Counter-offer: not added yet</option>
                      {offers
                        .filter((x) => x.id !== o.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {"Counter-offer: " + describe(x)}
                          </option>
                        ))}
                    </select>
                  )}
                  {counter && (
                    <button type="button" className="mini" onClick={() => focusOffer(counter.id)}>
                      Go to counter-offer
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini danger-quiet"
                    aria-label={"Remove the offer of " + describe(o)}
                    onClick={() => {
                      if (window.confirm("Remove this offer?")) saveOffers(offers.filter((x) => x.id !== o.id));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted" id="offer-none">
          No offers yet. Log each plea or settlement offer here, and what happened to it.
        </p>
      )}
      {suggest && (
        <div className="offer-suggest" id="offer-suggest" role="status">
          <span className="small">
            Offer accepted. Close the case as {OUTCOME_LABELS[offerOutcome(suggest)].toLowerCase()}?
          </span>
          <button type="button" className="btn" id="offer-close-case" onClick={() => close(suggest)}>
            Close as {OUTCOME_LABELS[offerOutcome(suggest)].toLowerCase()}
          </button>
          <button type="button" className="btn" id="offer-not-now" onClick={() => setSuggest(null)}>
            Not now
          </button>
        </div>
      )}
      <form className="deadline-add" id="offer-add" noValidate onSubmit={add} aria-label="Add an offer">
        <GameDateInput id="offer-date" aria-label="Date of the offer (in-game)" value={date} onChange={setDate} />
        <select id="offer-from" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value as OfferFrom)}>
          {OFFER_FROM.map((f) => (
            <option key={f} value={f}>
              {"From the " + FROM_LABELS[f].toLowerCase()}
            </option>
          ))}
        </select>
        <input
          type="text"
          id="offer-terms"
          maxLength={300}
          placeholder="The terms, in a sentence"
          aria-label="Terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
        />
        <button type="submit" className="btn" id="offer-submit">
          Add
        </button>
      </form>
      <p className="error" role="alert" id="offer-error">
        {error}
      </p>
    </>
  );
}
