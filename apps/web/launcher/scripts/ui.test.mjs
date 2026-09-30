import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright')
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const url = process.env.LAUNCHER_TEST_URL ?? 'http://localhost:5173'
const screenshots = join(tmpdir(), 'dsh-launcher-ui')
let browser

before(async () => {
  await mkdir(screenshots, { recursive: true })
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) })
})
after(async () => { await browser?.close(); console.log(`Screenshots: ${screenshots}`) })

async function pageFor(t, fixture = {}, viewport = { width: 560, height: 420 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: fixture.reducedMotion ? 'reduce' : 'no-preference', hasTouch: Boolean(fixture.touch), colorScheme: fixture.systemTheme ?? 'light' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no frontend or console errors') })
  await page.addInitScript(({ fixture, version }) => {
    if (!localStorage.getItem('dsh-launcher-locale')) localStorage.setItem('dsh-launcher-locale', fixture.locale ?? 'zh')
    window.fixture = {
      calls: [],
      status: { state: 'stopped', port: 3080, url: null, pid: null, external: false, logEntries: [], error: null, ...fixture.status },
      statusError: fixture.statusError, hold: fixture.hold, reject: fixture.reject,
      output: fixture.output ?? { success: true, stdout: '', stderr: '' },
    }
    const append = (source, message) => {
      const entries = window.fixture.status.logEntries
      const id = (entries.at(-1)?.id ?? 0) + 1
      entries.push({ id, source, message })
      if (entries.length > 200) entries.shift()
    }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      invoke: async (command, args) => {
        const data = window.fixture
        data.calls.push({ command, args })
        if (command === 'plugin:app|version') return version
        if (command === 'get_status') {
          if (data.statusError) throw new Error(data.statusError)
          return structuredClone(data.status)
        }
        if (data.hold) await new Promise((resolve) => { data.release = resolve })
        if (data.reject) throw new Error(data.reject)
        append('launcher', `Starting ${command}`)
        for (const [source, text] of [['stdout', data.output.stdout], ['stderr', data.output.stderr]]) {
          if (text) for (const line of text.trimEnd().split('\n')) append(source, line)
        }
        append('launcher', `${command} ${data.output.success ? 'completed' : 'failed'}`)
        return data.output
      },
    }
  }, { fixture, version: metadata.version })
  await page.goto(url)
  await page.locator('.service-state:not([data-state="loading"])').waitFor()
  await page.locator('.app-version').waitFor()
  await page.locator('.launcher-art').evaluate((image) => image.decode())
  return page
}

async function assertLayout(page, content = '.log-body') {
  const measures = await page.evaluate((selector) => {
    const main = document.querySelector('.launcher-main')
    const body = document.querySelector(selector)
    return { overflow: document.documentElement.scrollWidth > innerWidth, height: body.clientHeight, scrolls: main.scrollHeight > main.clientHeight + 1 }
  }, content)
  assert.equal(measures.overflow, false)
  assert.ok(measures.height > 40)
  if (page.viewportSize().width > 420 && page.viewportSize().height > 380) assert.equal(measures.scrolls, false)
}
const callsFor = (page, command) => page.evaluate((command) => window.fixture.calls.filter((call) => call.command === command), command)
async function screenshot(page, name) { await page.mouse.move(0, 0); await page.screenshot({ animations: 'disabled', path: join(screenshots, name) }) }
async function nextPoll(page) {
  const count = (await callsFor(page, 'get_status')).length
  await page.waitForFunction((count) => window.fixture.calls.filter((call) => call.command === 'get_status').length > count, count)
}

test('compact actions, rotated rounded icon, blur, and version', async (t) => {
  const page = await pageFor(t)
  const start = page.getByRole('button', { name: '启动服务', exact: true })
  const icon = start.locator('svg.tabler-icon-bleach')
  assert.equal(await icon.count(), 1)
  assert.equal(await icon.getAttribute('stroke-width'), '2')
  assert.deepEqual(await icon.evaluate((icon) => { const { a, b, c, d } = new DOMMatrix(getComputedStyle(icon).transform); return [a, b, c, d].map(Math.round) }), [0, 1, -1, 0])
  assert.equal(await start.evaluate((node) => getComputedStyle(node).fontSize), '14px')
  assert.match(await start.evaluate((node) => getComputedStyle(node).backdropFilter), /blur/)
  assert.match(await page.locator('.service-state').evaluate((node) => getComputedStyle(node).backdropFilter), /blur/)
  assert.equal(await page.locator('.app-version').innerText(), `v${metadata.version}`)
  assert.equal(await page.locator('.titlebar button').count(), 1)
  assert.equal(await page.locator('button.primary-button').count(), 1)
  assert.equal(await page.locator('[title]').count(), 0)
  await assertLayout(page)
  await screenshot(page, 'stopped-zh.png')
})

test('installation label expands and collapses without shifting the primary action', async (t) => {
  const page = await pageFor(t)
  const install = page.getByRole('button', { name: '安装', exact: true })
  const before = await install.boundingBox()
  const start = await page.getByRole('button', { name: '启动服务', exact: true }).boundingBox()
  assert.ok(Math.abs(before.width - before.height) < 1)
  await install.hover()
  await page.waitForFunction((width) => document.querySelector('.action-expand').getBoundingClientRect().width > width + 15, before.width)
  assert.deepEqual(await page.getByRole('button', { name: '启动服务', exact: true }).boundingBox(), start)
  await screenshot(page, 'action-expanded.png')
  await page.mouse.move(24, 24)
  await page.waitForFunction((width) => Math.abs(document.querySelector('.action-expand').getBoundingClientRect().width - width) < 1, before.width)
})

for (const state of ['starting', 'stopping']) {
  test(`${state} prevents conflicting actions`, async (t) => {
    const page = await pageFor(t, { status: { state } })
    for (const name of ['启动服务', '安装', '构建']) assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true)
  })
}

test('external service opens its URL without stop or restart controls', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-external', external: true, url: 'http://127.0.0.1:3080/' } })
  for (const name of ['停止', '重启']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0)
  await page.getByRole('button', { name: '打开服务', exact: true }).click()
  assert.deepEqual((await callsFor(page, 'open_url'))[0].args, { url: 'http://127.0.0.1:3080/' })
})

test('managed restart and empty-output stop appear in the unified log', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-managed', pid: 4242, url: 'http://127.0.0.1:3080/' } })
  for (const [name, command] of [['重启', 'restart_server'], ['停止', 'stop_server']]) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.locator('.log-result').getByText('已完成', { exact: true }).waitFor()
    await page.locator('.log-body').getByText(`${command} completed`, { exact: true }).waitFor()
    assert.equal((await callsFor(page, command)).length, 1)
  }
  assert.equal(await page.locator('[data-log-id]').count(), 4)
  await assertLayout(page)
})

test('pending work cannot be submitted twice even across settings', async (t) => {
  const page = await pageFor(t, { hold: true })
  await page.getByRole('button', { name: '安装', exact: true }).evaluate((button) => { button.click(); button.click() })
  await page.locator('.log-result').getByText('处理中', { exact: true }).waitFor()
  assert.equal((await callsFor(page, 'install_deps')).length, 1)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '构建', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.evaluate(() => window.fixture.release())
  await page.locator('.log-result').getByText('已完成', { exact: true }).waitFor()
  await page.locator('.log-body').getByText('install_deps completed', { exact: true }).waitFor()
})

test('first and later status failures do not enable start', async (t) => {
  const page = await pageFor(t, { statusError: 'Lost connection' })
  assert.equal(await page.getByRole('button', { name: '启动服务', exact: true }).isDisabled(), true)
  await page.evaluate(() => { window.fixture.statusError = null })
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.locator('.service-state[data-state="stopped"]').waitFor()
  await page.evaluate(() => { window.fixture.statusError = 'Lost again' })
  await page.locator('.service-state[data-state="unavailable"]').waitFor()
  assert.equal(await page.getByRole('button', { name: '启动服务', exact: true }).isDisabled(), true)
  await assertLayout(page)
})

test('IPC failures survive polls and switching settings', async (t) => {
  const page = await pageFor(t, { reject: 'Cannot execute command' })
  await page.getByRole('button', { name: '构建', exact: true }).click()
  await page.locator('.log-result').getByText('操作失败', { exact: true }).waitFor()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await nextPoll(page)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.locator('.log-body').getByText('Cannot execute command', { exact: true }).waitFor()
})

test('same text with distinct IDs survives polls, and settings does not pause logs', async (t) => {
  const logEntries = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, source: 'stdout', message: `Repeated message ${'payload '.repeat(20)}` }))
  const page = await pageFor(t, { status: { state: 'running-managed', pid: 4242, url: 'http://127.0.0.1:3080/', logEntries } })
  await nextPoll(page)
  assert.equal(await page.locator('[data-log-id]').count(), 200)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.evaluate(() => {
    window.fixture.status.logEntries.shift()
    window.fixture.status.logEntries.push({ id: 201, source: 'stdout', message: 'New log while settings is open' })
  })
  await nextPoll(page)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.locator('.log-body').getByText('New log while settings is open', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-log-id]').count(), 200)
  await assertLayout(page)
  await screenshot(page, 'running-zh.png')
  await page.setViewportSize({ width: 360, height: 420 })
  await assertLayout(page)
})

test('successful stderr and command output appear once without a failure badge', async (t) => {
  const page = await pageFor(t, { output: { success: true, stdout: 'Build complete', stderr: 'Warning: optional tool absent' } })
  await page.getByRole('button', { name: '构建', exact: true }).click()
  await page.locator('.log-body').getByText('Build complete', { exact: true }).waitFor()
  assert.equal(await page.locator('.log-body').getByText('Build complete', { exact: true }).count(), 1)
  assert.equal(await page.locator('.log-result').getAttribute('data-failed'), 'false')
})

test('theme follows the system until explicitly selected, then persists on reload', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await screenshot(page, 'settings-dark-zh.png')
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '跟随系统', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
})

test('language lives in settings, persists, and project link targets this directory', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await assertLayout(page, '.settings-panel')
  await screenshot(page, 'settings-light-zh.png')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('heading', { name: 'Local service', exact: true }).waitFor()
  await assertLayout(page, '.settings-panel')
  await screenshot(page, 'settings-light-en.png')
  assert.equal(await page.locator('.settings-about').innerText().then((text) => text.includes(`v${metadata.version}`)), true)
  await page.getByRole('button', { name: 'GitHub', exact: true }).click()
  assert.deepEqual((await callsFor(page, 'open_url')).at(-1).args, { url: metadata.homepage })
  await page.reload()
  await page.getByRole('heading', { name: 'Local service', exact: true }).waitFor()
})

test('one delegated tooltip handles viewport edges, dynamic content and removal', async (t) => {
  const page = await pageFor(t)
  assert.equal(await page.locator('[role="tooltip"]').count(), 1)
  for (const [left, top] of [[4, 4], [520, 4], [4, 380], [520, 380]]) {
    await page.evaluate(({ left, top }) => {
      const button = document.createElement('button')
      button.dataset.testEdge = ''
      button.dataset.tooltip = 'Long explanation '.repeat(30)
      button.textContent = '?'
      Object.assign(button.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, width: '30px', height: '30px' })
      document.body.append(button)
    }, { left, top })
    await page.locator('[data-test-edge]').hover()
    await page.locator('[role="tooltip"]:visible').waitFor()
    await page.waitForFunction(() => document.querySelector('[role="tooltip"]').style.visibility === 'visible')
    const box = await page.getByRole('tooltip').boundingBox()
    assert.ok(box.x >= 7 && box.y >= 7 && box.x + box.width <= 553 && box.y + box.height <= 413, JSON.stringify(box))
    await page.locator('[data-test-edge]').evaluate((node) => { node.dataset.tooltip = 'Updated text' })
    await page.getByRole('tooltip').getByText('Updated text', { exact: true }).waitFor()
    await page.locator('[data-test-edge]').evaluate((node) => node.remove())
    await page.locator('[role="tooltip"]:visible').waitFor({ state: 'hidden' })
  }
  assert.equal(await page.locator('[role="tooltip"]').count(), 1)
})

test('disabled controls explain their availability and Escape dismisses the tooltip', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-managed', url: 'http://127.0.0.1:3080/' } })
  await page.getByRole('button', { name: '安装', exact: true }).hover()
  await page.getByRole('tooltip').getByText('服务停止后可用', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[role="tooltip"]:visible').waitFor({ state: 'hidden' })
})

test('artwork follows the pointer without moving controls', async (t) => {
  const page = await pageFor(t)
  const art = page.locator('.launcher-art')
  assert.equal(await art.evaluate((image) => image.naturalWidth > 0 && getComputedStyle(image).pointerEvents === 'none'), true)
  const original = await art.evaluate((image) => getComputedStyle(image).transform)
  const button = page.getByRole('button', { name: '启动服务', exact: true })
  const bounds = await button.boundingBox()
  await page.mouse.move(500, 100)
  await page.waitForFunction((original) => getComputedStyle(document.querySelector('.launcher-art')).transform !== original, original)
  assert.deepEqual(await button.boundingBox(), bounds)
  await page.mouse.move(0, 0)
  await page.waitForFunction(() => !document.querySelector('.launcher').style.getPropertyValue('--pointer-x'))
})
for (const mode of ['reducedMotion', 'touch']) {
  test(`artwork remains still with ${mode}`, async (t) => {
    const page = await pageFor(t, { [mode]: true })
    const original = await page.locator('.launcher-art').evaluate((image) => getComputedStyle(image).transform)
    if (mode === 'touch') {
      await page.touchscreen.tap(480, 100)
      assert.equal(await page.getByRole('button', { name: '安装', exact: true }).locator('.action-label').evaluate((node) => getComputedStyle(node).opacity), '1')
    } else await page.mouse.move(500, 100)
    assert.equal(await page.locator('.launcher-art').evaluate((image) => getComputedStyle(image).transform), original)
  })
}
