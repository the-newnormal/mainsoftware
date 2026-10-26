// A labelled box for people's own words (C0.9 PR 3b; T21; WCAG 3.3.2): the requests form's text and
// the DPO's summary and notes. It is the kit's Field around a <textarea> with CONTROL_CLASS's 16 px
// text and 44 px floor, about five rows by default, which the person can make taller (resize-y), and
// dir="auto", so a message written right to left reads in its own direction. Lines under the box (a
// count of characters, a hint about what it holds) describe it after its hint, and are read with
// it on focus, never announced on each keystroke (X11). No autofill: what is written is the
// person's own, never their saved details. The form's noValidate keeps the browser's own checks
// away (KM-14), so maxLength is never set: a long text is a problem the form words.
import { type Ref, useId } from 'react'
import { cx } from './cx.ts'
import { CONTROL_CLASS, Field } from './Field.tsx'

export interface TextAreaProps {
  label: string
  hint?: string
  error?: string
  // Lines under the box that describe it (a live count, a hint about its contents).
  notes?: readonly string[]
  // The ids of lines elsewhere that say what is wrong with it: it is marked invalid, and they
  // describe it after its notes.
  problems?: readonly string[]
  value: string
  onChange(value: string): void
  name: string
  rows?: number
  required?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

export function TextArea({
  label,
  hint,
  error,
  notes = [],
  problems = [],
  value,
  onChange,
  name,
  rows = 5,
  required,
  ref,
}: TextAreaProps) {
  const notesId = useId()
  return (
    <Field label={label} hint={hint} error={error}>
      {control => {
        const describedBy = [
          control['aria-describedby'],
          ...notes.map((_, at) => `${notesId}${at}`),
          ...problems,
        ].filter(Boolean)
        return (
          <>
            <textarea
              ref={ref}
              id={control.id}
              aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
              aria-invalid={control['aria-invalid'] ?? (problems.length > 0 ? true : undefined)}
              aria-required={required || undefined}
              name={name}
              rows={rows}
              dir="auto"
              autoComplete="off"
              value={value}
              onChange={event => onChange(event.currentTarget.value)}
              className={cx(CONTROL_CLASS, 'resize-y py-2.5')}
            />
            {notes.map((note, at) => (
              <p key={note} id={`${notesId}${at}`} className="text-small text-muted">
                {note}
              </p>
            ))}
          </>
        )
      }}
    </Field>
  )
}
