import { columnsFromTops, nextRadioIndex } from './rovingRadioLogic'

// onKeyDown for a role="radiogroup" whose options are role="radio" buttons with
// a roving tabIndex (see rovingRadioLogic). An arrow key focuses the next option
// and clicks it, so the option's own onClick does the picking.
export function onRadioGroupKeyDown(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const radios = [...e.currentTarget.querySelectorAll('[role="radio"]')]
  const index = radios.indexOf(document.activeElement)
  if (index < 0) return
  const columns = columnsFromTops(radios.map(r => r.getBoundingClientRect().top))
  const next = nextRadioIndex(e.key, index, radios.length, columns)
  if (next === null) return
  e.preventDefault()
  if (next === index) return
  radios[next].focus()
  radios[next].click()
}
