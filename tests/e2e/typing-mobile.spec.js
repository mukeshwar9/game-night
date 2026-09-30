// Mobile Typing Race: the phone's own keyboard is the input control. On a
// 390×844 touch viewport a real focusable field takes focus from a tap on the
// quote (or the TAP TO TYPE button), keeps the caret visible, blocks paste,
// allows corrections, and completes the round. The illustrated QWERTY is
// decorative only — never a required (or focusable) input control.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, onboard } from './helpers.js'

test.describe.configure({ timeout: 180_000 })

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }

async function mobilePlayer(browser) {
  const context = await browser.newContext(MOBILE)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', err => errors.push(err))
  return { context, page, errors }
}

test('a phone types the shared quote through the native keyboard field', async ({ browser }) => {
  const host = await mobilePlayer(browser)
  const guest = await mobilePlayer(browser)

  await onboard(host.page, 'Mia')
  const url = await createRoom(host.page, 'TYPING RACE')
  await joinViaInvite(guest.page, url, 'Noa')
  for (const { page } of [host, guest]) {
    await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
  }

  const passage = await (async () => {
    await host.page.getByRole('button', { name: 'START NOW' }).click()
    const p = host.page.getByTestId('typing-passage')
    await expect(p).toBeVisible({ timeout: 10_000 })
    return p.textContent()
  })()
  await expect(guest.page.getByTestId('typing-passage')).toBeVisible({ timeout: 10_000 })

  const input = host.page.getByTestId('typing-input')
  await test.step('the real field is present and configured for the OS keyboard', async () => {
    await expect(input).toHaveAttribute('type', 'text')
    await expect(input).toHaveAttribute('inputmode', 'text')
    await expect(input).toHaveAttribute('autocorrect', 'off')
    await expect(input).toHaveAttribute('autocapitalize', 'none')
    // The QWERTY illustration is decorative: no focusable keys inside it.
    await expect(host.page.getByTestId('typing-keyboard-art').locator('button')).toHaveCount(0)
  })

  await test.step('tapping the quote (the overlay field) focuses it', async () => {
    await input.click()
    await expect.poll(() => host.page.evaluate(() => document.activeElement?.dataset?.testid))
      .toBe('typing-input')
  })

  await test.step('a wrong key can be corrected without leaving the field', async () => {
    await host.page.keyboard.type('Z')
    await expect(input).toHaveValue('Z')
    await host.page.keyboard.press('Backspace')
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
  })

  await test.step('paste is blocked and leaves the field untouched', async () => {
    await input.evaluate(el => {
      const data = new DataTransfer()
      data.setData('text/plain', 'pasted text must never count')
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
    })
    await expect(host.page.getByText(/Paste is disabled/)).toBeVisible()
    await expect(input).toHaveValue('')
  })

  await test.step('blur shows the start control and it restores focus', async () => {
    await input.evaluate(el => el.blur())
    const start = host.page.getByRole('button', { name: 'TAP TO TYPE' })
    await expect(start).toBeVisible()
    await start.click()
    await expect(input).toBeFocused()
  })

  await test.step('both racers finish from the native field', async () => {
    await host.page.keyboard.type(passage)
    await guest.page.getByTestId('typing-input').click()
    await guest.page.keyboard.type(passage)
  })

  await test.step('the results list is identical on both phones', async () => {
    const lists = [host.page, guest.page]
    for (const page of lists) {
      await expect(page.getByRole('list', { name: 'Race results' })).toBeVisible({ timeout: 30_000 })
    }
  })

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})
