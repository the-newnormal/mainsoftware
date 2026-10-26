// A short code shown as people quote it and spoken symbol by symbol (C0.9 PD-104: a request's
// reference, "K7QM-X3TD", which a screen reader would otherwise read as a word): the shown text is
// hidden from assistive technology and a visually hidden copy says it spelled out. It never breaks
// across its hyphen and is never translated.
export function Spelled({ text, spoken }: { text: string; spoken: string }) {
  return (
    <span translate="no" className="whitespace-nowrap">
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
