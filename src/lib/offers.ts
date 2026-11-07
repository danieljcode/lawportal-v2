// Plea and settlement offers on a case (LP-229): who made each, when, its terms and what happened to
// it. They live on the case, so they save, sync and back up with it. Pure: no storage.

import { ISO_DATE_RE, isId, newId, text, uniqueById } from "./storage";
import type { OutcomeResult } from "./types";

export const OFFER_FROM = ["prosecution", "defence", "plaintiff", "defendant"] as const;
export type OfferFrom = (typeof OFFER_FROM)[number];
export const OFFER_RESPONSES = ["pending", "accepted", "rejected", "countered"] as const;
export type OfferResponse = (typeof OFFER_RESPONSES)[number];

export interface Offer {
  id: string;
  /** In-game date, YYYY-MM-DD. */
  date: string;
  from: OfferFrom;
  terms: string;
  response: OfferResponse;
  /** The counter-offer, when countered. */
  counter?: string;
}

export const MAX_OFFERS = 100;

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Normalise an untrusted offer; null without a date or terms. */
export function cleanOffer(input: unknown): Offer | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const terms = text(o.terms, 300);
  if (!terms || typeof o.date !== "string" || !ISO_DATE_RE.test(o.date)) return null;
  const response = oneOf(OFFER_RESPONSES, o.response, "pending");
  return {
    id: isId(o.id) ? o.id : newId(),
    date: o.date,
    from: oneOf(OFFER_FROM, o.from, "prosecution"),
    terms,
    response,
    ...(response === "countered" && isId(o.counter) && o.counter !== o.id ? { counter: o.counter } : {}),
  };
}

/** A case's offers, newest first. */
export function cleanOffers(input: unknown): Offer[] {
  return uniqueById(input, cleanOffer)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_OFFERS);
}

/** Two copies of one case's offers as one list: by id, the first (newer) copy wins. */
export function unionOffers(first: Offer[], second: Offer[]): Offer[] {
  return cleanOffers([...first, ...second]);
}

/** The outcome an accepted offer suggests: a plea deal in a criminal case, else a settlement. */
export function offerOutcome(o: Pick<Offer, "from">): OutcomeResult {
  return o.from === "prosecution" || o.from === "defence" ? "plea" : "settled";
}
