import { Fragment, type ReactNode } from 'react'

/** A translated message whose `{name}` placeholders are elements (links). */
export function Rich({
  text,
  parts
}: {
  text: string
  parts: Record<string, ReactNode>
}) {
  return text.split(/(\{\w+\})/).map((chunk, i) => {
    const name = /^\{(\w+)\}$/.exec(chunk)?.[1]
    return (
      <Fragment key={i}>
        {name !== undefined && name in parts ? parts[name] : chunk}
      </Fragment>
    )
  })
}
