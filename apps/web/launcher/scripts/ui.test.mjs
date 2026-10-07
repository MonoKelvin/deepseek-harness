import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEV_PORT } from './constants.mjs'

const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright')
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const url = process.env.LAUNCHER_TEST_URL ?? `http://localhost:${DEV_PORT}`
const screenshots = join(tmpdir(), 'dsh-launcher-ui')
let browser

before(async () => {
  await mkdir(screenshots, { recursive: true })
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) })
})
after(async () => { await browser?.close(); console.log(`Screenshots: ${screenshots}`) })

async function pageFor(t, fixture = {}, viewport = { width: 620, height: 480 }) {
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
      settings: { dshDirectory: 'C:\\code\\deepseek-harness', theme: 'system', locale: 'zh', port: 3080, autostart: false, stopServicesOnExit: true, ...fixture.settings },
      failures: fixture.failures ?? {},
      pickedDirectory: fixture.pickedDirectory ?? null,
      directoryValid: fixture.directoryValid ?? true,
      clipboardError: fixture.clipboardError,
      copiedText: null,
      output: fixture.output ?? { success: true, stdout: '', stderr: '' },
    }
    let nextLogId = Math.max(0, ...window.fixture.status.logEntries.map(entry => entry.id)) + 1
    const callbacks = new Map()
    let nextCallbackId = 1
    const dispatch = (event, payload) => {
      for (const [id, callback] of callbacks) callback({ event, id, payload })
    }
    const append = (source, message, severity = 'info') => {
      const entries = window.fixture.status.logEntries
      const entry = { id: nextLogId++, source, severity, timestamp: new Date().toISOString(), message }
      entries.push(entry)
      if (entries.length > 200) entries.shift()
      dispatch('log-entry', entry)
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => {
        if (window.fixture.clipboardError) throw new Error(window.fixture.clipboardError)
        window.fixture.copiedText = text
      },
    } })
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event, id) => { callbacks.delete(id) },
    }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: (callback) => { const id = nextCallbackId++; callbacks.set(id, callback); return id },
      unregisterCallback: (id) => { callbacks.delete(id) },
      runCallback: (id, data) => { callbacks.get(id)?.(data) },
      invoke: async (command, args) => {
        const data = window.fixture
        data.calls.push({ command, args })
        if (command === 'plugin:event|listen') return args.handler
        if (command === 'plugin:event|unlisten') return null
        // The window reveals itself on mount; treat window commands as no-ops and
        // report a non-silent launch so the reveal path runs without logging.
        if (command.startsWith('plugin:window|')) return null
        if (command === 'is_autostart_launch') return false
        if (data.failures[command]) throw new Error(data.failures[command])
        if (command === 'plugin:app|version') return version
        if (command === 'get_settings') return structuredClone(data.settings)
        if (command === 'clear_logs') {
          data.status.logEntries = []
          return
        }
        if (command === 'open_directory_picker') return data.pickedDirectory
        if (command === 'set_dsh_directory') {
          data.settings.dshDirectory = args.path
          data.status.dshDirectoryValid = data.directoryValid
          return structuredClone(data.settings)
        }
        if (command === 'set_theme') {
          data.settings.theme = args.theme
          return
        }
        if (command === 'set_locale') {
          data.settings.locale = args.locale
          return
        }
        if (command === 'set_autostart') {
          data.settings.autostart = args.enabled
          return structuredClone(data.settings)
        }
        if (command === 'set_stop_services_on_exit') {
          data.settings.stopServicesOnExit = args.enabled
          return structuredClone(data.settings)
        }
        if (command === 'set_server_port') {
          data.settings.port = args.port
          return structuredClone(data.settings)
        }
        if (command === 'get_status') {
          if (data.statusError) throw new Error(data.statusError)
          const status = structuredClone(data.status)
          if (!('dshDirectoryValid' in status)) status.dshDirectoryValid = true
          return status
        }
        if (data.hold) await new Promise((resolve) => { data.release = resolve })
        if (data.reject) throw new Error(data.reject)
        append('launcher', `Starting command: ${command}`)
        for (const [source, text] of [['stdout', data.output.stdout], ['stderr', data.output.stderr]]) {
          if (text) for (const line of text.trimEnd().split('\n')) append(source, line, source === 'stderr' ? 'warn' : 'info')
        }
        append('launcher', `${command} ${data.output.success ? 'succeeded' : 'failed'}`)
        return data.output
      },
    }
  }, { fixture, version: metadata.version })
  await page.goto(url)
  await page.locator('.service-state:not([data-state="loading"])').waitFor()
  await page.locator('.wordmark').waitFor()
  await page.locator('.launcher-art[data-ready="true"]').waitFor()
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
  // The window carries a 30px transparent shadow gutter on every side, so the
  // content fills the viewport minus 60px per axis; these large-window thresholds
  // are the old 420x380 content floor plus that gutter.
  if (page.viewportSize().width > 480 && page.viewportSize().height > 440) assert.equal(measures.scrolls, false)
}
const callsFor = (page, command) => page.evaluate((command) => window.fixture.calls.filter((call) => call.command === command), command)
async function screenshot(page, name) { await page.mouse.move(0, 0); await page.screenshot({ animations: 'disabled', path: join(screenshots, name) }) }
async function nextPoll(page) {
  const count = (await callsFor(page, 'get_status')).length
  await page.waitForFunction((count) => window.fixture.calls.filter((call) => call.command === 'get_status').length > count, count)
}

test('compact actions, rotated rounded icon, and blur', async (t) => {
  const page = await pageFor(t)
  const start = page.getByRole('button', { name: '启动服务', exact: true })
  const icon = start.locator('svg.tabler-icon-bleach')
  assert.equal(await icon.count(), 1)
  assert.equal(await icon.getAttribute('stroke-width'), '2')
  assert.deepEqual(await icon.evaluate((icon) => { const { a, b, c, d } = new DOMMatrix(getComputedStyle(icon).transform); return [a, b, c, d].map(Math.round) }), [0, 1, -1, 0])
  assert.equal(await start.evaluate((node) => getComputedStyle(node).fontSize), '14px')
  assert.match(await start.evaluate((node) => getComputedStyle(node).backdropFilter), /blur/)
  assert.match(await page.locator('.service-state').evaluate((node) => getComputedStyle(node).backdropFilter), /blur/)
  assert.equal(await page.locator('.titlebar button').count(), 1)
  assert.equal(await page.locator('button.start-button').count(), 1)
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

test('an externally started service opens its URL and can be restarted or stopped', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-external', external: true, url: 'http://127.0.0.1:3080/' } })
  assert.equal(await page.locator('.service-state-label').innerText(), '已在运行（外部启动）')
  await page.getByRole('button', { name: '打开DSH', exact: true }).click()
  assert.deepEqual((await callsFor(page, 'open_url'))[0].args, { url: 'http://127.0.0.1:3080/' })
  for (const [name, command] of [['重启', 'restart_server'], ['停止', 'stop_server']]) {
    const control = page.getByRole('button', { name, exact: true })
    assert.equal(await control.innerText(), '', 'lifecycle controls are icon-only')
    const box = await control.boundingBox()
    assert.ok(Math.abs(box.width - box.height) < 1, `round control: ${box.width}x${box.height}`)
    assert.match(await control.evaluate((node) => getComputedStyle(node).backdropFilter), /blur/)
    await control.click()
    await page.locator('.log-result').getByText('已完成', { exact: true }).waitFor()
    await page.locator('.log-body').getByText(`${command} succeeded`, { exact: true }).waitFor()
    assert.equal((await callsFor(page, command)).length, 1)
  }
  await assertLayout(page)
  await screenshot(page, 'external-zh.png')
})

test('copying swaps the log copy button to a moss check, blocks a second copy, then reverts', async (t) => {
  const page = await pageFor(t)
  const copy = page.getByRole('button', { name: '复制日志', exact: true })
  const checkOpacity = () => copy.locator('.copy-glyph-check').evaluate((node) => getComputedStyle(node).opacity)
  assert.equal(await checkOpacity(), '0')
  assert.equal(await copy.locator('.copy-glyph-check').evaluate((node) => getComputedStyle(node).color), 'rgb(70, 139, 47)')

  await copy.click()
  await page.waitForFunction(() => window.fixture.copiedText !== null)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.copy-glyph-check')).opacity === '1')
  assert.equal(await copy.getAttribute('data-copied'), 'true')
  assert.equal(await copy.isDisabled(), true)
  // The blocked state must not dim the mark, which would wash the green out.
  assert.equal(await copy.evaluate((node) => getComputedStyle(node).opacity), '1')

  await page.waitForFunction(() => document.querySelector('.copy-button').dataset.copied === 'false', undefined, { timeout: 5000 })
  assert.equal(await copy.isDisabled(), false)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.copy-glyph-check')).opacity === '0')
})

test('managed restart and empty-output stop appear in the unified log', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-managed', pid: 4242, url: 'http://127.0.0.1:3080/' } })
  for (const [name, command] of [['重启', 'restart_server'], ['停止', 'stop_server']]) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.locator('.log-result').getByText('已完成', { exact: true }).waitFor()
    await page.locator('.log-body').getByText(`${command} succeeded`, { exact: true }).waitFor()
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
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '构建', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.evaluate(() => window.fixture.release())
  await page.locator('.log-result').getByText('已完成', { exact: true }).waitFor()
  await page.locator('.log-body').getByText('install_deps succeeded', { exact: true }).waitFor()
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
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await nextPoll(page)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.locator('.log-body').getByText('构建失败：Cannot execute command', { exact: true }).waitFor()
})

test('same text with distinct IDs survives polls, and settings does not pause logs', async (t) => {
  const logEntries = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, source: 'stdout', severity: 'info', timestamp: new Date().toISOString(), message: `Repeated message ${'payload '.repeat(20)}` }))
  const page = await pageFor(t, { status: { state: 'running-managed', pid: 4242, url: 'http://127.0.0.1:3080/', logEntries } })
  await nextPoll(page)
  assert.equal(await page.locator('[data-log-id]').count(), 200)
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await page.evaluate(() => {
    window.fixture.status.logEntries.shift()
    window.fixture.status.logEntries.push({ id: 201, source: 'stdout', severity: 'info', timestamp: new Date().toISOString(), message: 'New log while settings is open' })
  })
  await nextPoll(page)
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  await page.locator('.log-body').getByText('New log while settings is open', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-log-id]').count(), 200)
  await assertLayout(page)
  await screenshot(page, 'running-zh.png')
  await page.setViewportSize({ width: 420, height: 480 })
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
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await screenshot(page, 'settings-dark-zh.png')
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await page.getByRole('button', { name: '系统', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
})

test('language lives in settings, persists, and project link targets this directory', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await assertLayout(page, '.settings-panel')
  await screenshot(page, 'settings-light-zh.png')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('heading', { name: 'Local service', exact: true }).waitFor()
  await assertLayout(page, '.settings-panel')
  await screenshot(page, 'settings-light-en.png')
  assert.equal(await page.locator('.settings-app-version').innerText(), `v${metadata.version}`)
  assert.equal(await page.locator('.settings-about').innerText().then((text) => text.includes(`v${metadata.version}`)), false)
  await page.getByRole('link', { name: 'GitHub', exact: true }).click()
  assert.deepEqual((await callsFor(page, 'open_url')).at(-1).args, { url: metadata.homepage })
  assert.equal(await page.locator('.settings-source-link svg').count(), 1)
  await page.reload()
  await page.getByRole('heading', { name: 'Local service', exact: true }).waitFor()
})

test('autostart switch follows language, defaults off, and reports its change', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  assert.deepEqual(
    await page.locator('.setting-label > span, .setting-label > label').evaluateAll(labels => labels.map(label => label.textContent)),
    ['DSH目录', '服务端口', '外观', '语言', '开机自启', '退出时停止服务'],
  )
  const toggle = page.getByRole('switch', { name: '开机自启', exact: true })
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  await screenshot(page, 'settings-autostart-zh.png')
  await toggle.click()
  await page.waitForFunction(() => window.fixture.settings.autostart === true)
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.deepEqual((await callsFor(page, 'set_autostart')).at(-1).args, { enabled: true })
})

test('stop-on-exit switch defaults on and reports its change', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  const toggle = page.getByRole('switch', { name: '退出时停止服务', exact: true })
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await toggle.click()
  await page.waitForFunction(() => window.fixture.settings.stopServicesOnExit === false)
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  assert.deepEqual((await callsFor(page, 'set_stop_services_on_exit')).at(-1).args, { enabled: false })
})

test('server port shows the persisted value, saves a valid edit, and rejects an invalid one', async (t) => {
  const page = await pageFor(t)
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  const input = page.locator('#server-port')
  assert.equal(await input.inputValue(), '3080')
  await input.fill('4000')
  await input.blur()
  await page.waitForFunction(() => window.fixture.settings.port === 4000)
  assert.deepEqual((await callsFor(page, 'set_server_port')).at(-1).args, { port: 4000 })
  // An out-of-range port is not sent and the field snaps back to the saved value.
  await input.fill('70000')
  await input.blur()
  assert.equal(await input.inputValue(), '4000')
  assert.equal((await callsFor(page, 'set_server_port')).length, 1)
})

test('server port is locked while the service is running', async (t) => {
  const page = await pageFor(t, { status: { state: 'running-managed', pid: 4242, url: 'http://127.0.0.1:3080/' } })
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  assert.equal(await page.locator('#server-port').isDisabled(), true)
})

for (const locale of ['zh', 'en']) {
  test(`${locale} log snapshot uses compact columns and one toolbar without toasts`, async (t) => {
    const logEntries = [
      { id: 1, source: 'stdout', severity: 'info', timestamp: '2026-09-30 06:07:08.123', message: 'Server ready' },
      { id: 2, source: 'stderr', severity: 'warn', timestamp: '2026-09-30 06:07:09.456', message: 'Optional configuration missing' },
    ]
    const levels = locale === 'zh' ? ['信息', '警告'] : ['Info', 'Warn']
    const displayed = levels.map(level => `[${level}]`)
    const page = await pageFor(t, { locale, status: { logEntries } })
    assert.deepEqual(await page.locator('.log-line').evaluateAll(lines => lines.map(line => [...line.children].map(node => node.textContent))), [
      ['06:07:08.123', displayed[0], 'Server ready'],
      ['06:07:09.456', displayed[1], 'Optional configuration missing'],
    ])
    assert.equal(await page.locator('.log-timestamp').first().getAttribute('data-tooltip'), '2026-09-30 06:07:08.123 UTC')
    for (const width of [660, 420]) {
      await page.setViewportSize({ width, height: 540 })
      const measures = await page.evaluate(() => {
        const tabs = document.querySelector('.panel-tabs').getBoundingClientRect()
        const actions = document.querySelector('.toolbar-actions').getBoundingClientRect()
        const toolbar = document.querySelector('.details-toolbar').getBoundingClientRect()
        const [time, level, message] = [...document.querySelector('.log-line').children].map(node => node.getBoundingClientRect())
        return { centerDelta: Math.abs(tabs.y + tabs.height / 2 - actions.y - actions.height / 2), right: actions.right, edge: toolbar.right, gaps: [level.left - time.right, message.left - level.right] }
      })
      assert.ok(measures.centerDelta < 1)
      assert.ok(measures.right <= measures.edge)
      for (const gap of measures.gaps) assert.ok(gap >= 5 && gap <= 7, `column gap: ${gap}`)
      await assertLayout(page)
    }
    await screenshot(page, `compact-logs-${locale}.png`)
    await page.getByRole('button', { name: locale === 'zh' ? '复制日志' : 'Copy logs', exact: true }).click()
    await page.waitForFunction(() => window.fixture.copiedText !== null)
    assert.equal(await page.evaluate(() => window.fixture.copiedText), logEntries.map((entry, index) => `${entry.timestamp} [${levels[index]}] ${entry.message}`).join('\n'))
    assert.equal(await page.locator('[class*="toast"], [role="dialog"], [role="alertdialog"]').count(), 0)
    await page.getByRole('button', { name: locale === 'zh' ? '清空日志' : 'Clear logs', exact: true }).click()
    await page.locator('.log-empty').waitFor()
    await nextPoll(page)
    assert.equal(await page.locator('.log-line').count(), 0)
    await page.getByRole('button', { name: locale === 'zh' ? '软件设置' : 'Settings', exact: true }).click()
    assert.equal(await page.locator('.toolbar-actions').count(), 0)
  })

  test(`${locale} directory error stays inside the status badge with a localized tooltip`, async (t) => {
    const page = await pageFor(t, { locale, status: { dshDirectoryValid: false, error: 'DSH directory not configured' } }, { width: 420, height: 540 })
    const explanation = locale === 'zh'
      ? 'DSH 目录未配置或无效，请在软件设置中指定项目根目录。'
      : 'The DSH directory is missing or invalid. Select the project root in App settings.'
    const icon = page.locator('.service-state .status-error-icon')
    assert.equal(await icon.count(), 1)
    assert.equal(await icon.getAttribute('aria-label'), explanation)
    assert.equal(await page.locator('.service').innerText().then(text => text.includes('DSH directory not configured')), false)
    assert.equal(await page.locator('.status-error, .dsh-missing, .service a').count(), 0)
    const fits = await icon.evaluate(node => {
      const icon = node.getBoundingClientRect()
      const badge = node.parentElement.getBoundingClientRect()
      const heading = node.closest('.service-heading').getBoundingClientRect()
      return icon.left >= badge.left && icon.right <= badge.right && icon.top >= badge.top && icon.bottom <= badge.bottom && badge.right <= heading.right
    })
    assert.equal(fits, true)
    await icon.focus()
    await page.getByRole('tooltip').getByText(explanation, { exact: true }).waitFor()
    await screenshot(page, `status-error-${locale}.png`)
    await page.keyboard.press('Escape')
    await page.locator('[role="tooltip"]:visible').waitFor({ state: 'hidden' })
  })

  test(`${locale} settings align controls, embed the picker and save complete directory edits`, async (t) => {
    const longPath = 'C:\\workspaces\\projects\\a-very-long-directory\\deepseek-harness'
    const page = await pageFor(t, { locale, settings: { dshDirectory: longPath } })
    await page.getByRole('button', { name: locale === 'zh' ? '软件设置' : 'Settings', exact: true }).click()
    assert.deepEqual(await page.locator('.setting-label').evaluateAll(labels => labels.map(label => label.innerText.split('\n').filter(Boolean))), locale === 'zh'
      ? [['DSH目录', '设置DSH程序或者源码的路径'], ['服务端口', 'dsh 服务监听的端口'], ['外观', '软件的显示主题'], ['语言', '软件的显示语言'], ['开机自启', '是否开机自动静默运行软件'], ['退出时停止服务', '退出软件时一并停止服务']]
      : [['DSH directory', 'Project root'], ['Server port', 'Port the dsh service listens on'], ['Appearance', 'Display theme'], ['Language', 'Display language'], ['Launch at startup', 'Auto-run the app silently on startup'], ['Stop on exit', 'Stop the service when the app exits']])
    assert.equal(await page.locator('.settings-app-version').innerText(), `v${metadata.version}`)
    assert.equal(await page.locator('.settings-app-description').innerText(), locale === 'zh'
      ? '一款用于启动、停止并监控本地 DeepSeek Harness Web端服务的工具软件。'
      : 'A tool to start, stop, and monitor your local DeepSeek Harness web service.')
    for (const width of [660, 420]) {
      await page.setViewportSize({ width, height: 540 })
      const rows = await page.locator('.setting-row').evaluateAll(rows => rows.map(row => {
        const label = row.querySelector('.setting-label')
        const value = row.querySelector('.setting-control').firstElementChild
        const bounds = row.getBoundingClientRect()
        const caption = row.querySelector('.setting-caption')
        const range = document.createRange()
        if (caption) range.selectNodeContents(caption)
        return {
          leftDelta: Math.abs(label.getBoundingClientRect().left - bounds.left),
          rightDelta: Math.abs(value.getBoundingClientRect().right - bounds.right),
          textAlign: getComputedStyle(label).textAlign,
          captionFits: !caption || (range.getBoundingClientRect().width <= label.clientWidth + 1 && caption.getBoundingClientRect().height <= parseFloat(getComputedStyle(caption).lineHeight) + 1),
        }
      }))
      for (const row of rows) {
        assert.ok(row.leftDelta < 1 && row.rightDelta < 1, JSON.stringify(row))
        assert.equal(row.textAlign, 'left')
        assert.equal(row.captionFits, true)
      }
      const inputLayout = await page.locator('#dsh-directory').evaluate(input => {
        const bounds = input.getBoundingClientRect()
        const button = input.parentElement.querySelector('button').getBoundingClientRect()
        const style = getComputedStyle(input)
        return { inside: button.left >= bounds.left && button.right <= bounds.right && button.top >= bounds.top && button.bottom <= bounds.bottom, gap: button.left - (bounds.right - parseFloat(style.paddingRight)), align: style.textAlign }
      })
      assert.equal(inputLayout.inside, true)
      assert.ok(inputLayout.gap >= 6)
      assert.equal(inputLayout.align, 'left')
      await assertLayout(page, '.settings-panel')
    }
    await screenshot(page, `compact-settings-${locale}.png`)
    const input = page.getByRole('textbox', { name: locale === 'zh' ? 'DSH目录' : 'DSH directory', exact: true })
    const path = 'C:\\projects\\deepseek-harness'
    await input.fill(path)
    assert.equal((await callsFor(page, 'set_dsh_directory')).length, 0)
    await input.press('Enter')
    await page.waitForFunction(() => window.fixture.calls.filter(call => call.command === 'set_dsh_directory').length === 1)
    assert.deepEqual((await callsFor(page, 'set_dsh_directory'))[0].args, { path })
    const picker = page.getByRole('button', { name: locale === 'zh' ? '选择 DSH 目录' : 'Choose DSH directory', exact: true })
    await picker.click()
    assert.equal((await callsFor(page, 'set_dsh_directory')).length, 1)
    await page.evaluate(path => { window.fixture.pickedDirectory = path }, longPath)
    await picker.click()
    await page.waitForFunction(path => document.querySelector('#dsh-directory').value === path, longPath)
    assert.equal((await callsFor(page, 'set_dsh_directory')).length, 2)
  })
}

test('status errors are translated, retained, and not repeated on every failed poll', async (t) => {
  const page = await pageFor(t, { statusError: 'state not managed for field `state` on command `get_status`' })
  await page.locator('.log-message').getByText('本地服务失败：启动器状态尚未初始化，请重启启动器。', { exact: true }).waitFor()
  await nextPoll(page)
  assert.equal(await page.locator('.log-line').count(), 1)
  assert.equal(await page.locator('.status-error-icon').getAttribute('data-tooltip'), '启动器状态尚未初始化，请重启启动器。')
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  assert.equal(await page.locator('#dsh-directory').getAttribute('aria-invalid'), 'false')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'Logs', exact: true }).click()
  await page.locator('.log-message').getByText('Local service failed: The launcher state is not initialized. Restart the launcher.', { exact: true }).waitFor()
  assert.equal(await page.locator('.log-line').count(), 1)
})

test('clipboard, clear, settings and picker failures remain visible as logs', async (t) => {
  const page = await pageFor(t, {
    clipboardError: 'Clipboard unavailable',
    failures: { clear_logs: 'Cannot clear', set_theme: 'Cannot save theme', open_directory_picker: 'Cannot open picker' },
  })
  await page.getByRole('button', { name: '复制日志', exact: true }).click()
  await page.locator('.log-message').getByText('复制日志失败：Clipboard unavailable', { exact: true }).waitFor()
  await page.getByRole('button', { name: '清空日志', exact: true }).click()
  await page.locator('.log-message').getByText('清空日志失败：Cannot clear', { exact: true }).waitFor()
  await page.getByRole('button', { name: '软件设置', exact: true }).click()
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await page.getByRole('button', { name: '选择 DSH 目录', exact: true }).click()
  await page.getByRole('button', { name: '运行日志', exact: true }).click()
  for (const text of ['外观失败：Cannot save theme', '选择 DSH 目录失败：Cannot open picker']) await page.locator('.log-message').getByText(text, { exact: true }).waitFor()
  await nextPoll(page)
  assert.equal(await page.locator('.log-line[data-severity="error"]').count(), 4)
  assert.equal(await page.locator('[class*="toast"], [role="dialog"], [role="alertdialog"]').count(), 0)
  await page.evaluate(() => { window.fixture.failures = {} })
  await page.getByRole('button', { name: '清空日志', exact: true }).click()
  await page.locator('.log-empty').waitFor()
})

test('one delegated tooltip handles viewport edges, dynamic content and removal', async (t) => {
  // Pinned to the pre-gutter viewport: this exercises the delegated tooltip's
  // clamp to the window edges, which tracks the viewport, not the launcher content.
  const page = await pageFor(t, {}, { width: 560, height: 420 })
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
  assert.equal(await art.evaluate((node) => node.width > 0 && getComputedStyle(node).pointerEvents === 'none'), true)
  const original = await art.evaluate((image) => getComputedStyle(image).transform)
  const button = page.getByRole('button', { name: '启动服务', exact: true })
  const bounds = await button.boundingBox()
  await page.mouse.move(500, 100)
  await page.waitForFunction((original) => getComputedStyle(document.querySelector('.launcher-art')).transform !== original, original)
  assert.deepEqual(await button.boundingBox(), bounds)
  await page.mouse.move(0, 0)
  await page.waitForFunction(() => !document.querySelector('.launcher-art').style.getPropertyValue('--pointer-x'))
})
test('artwork remains still with touch', async (t) => {
  const page = await pageFor(t, { touch: true })
  const original = await page.locator('.launcher-art').evaluate((node) => getComputedStyle(node).transform)
  await page.touchscreen.tap(480, 100)
  assert.equal(await page.getByRole('button', { name: '安装', exact: true }).locator('.action-label').evaluate((node) => getComputedStyle(node).opacity), '1')
  assert.equal(await page.locator('.launcher-art').evaluate((node) => getComputedStyle(node).transform), original)
})

// The OS "Animation effects" toggle drives prefers-reduced-motion, and the
// pointer-follow tilt is intentional, so it must still track the pointer there.
test('artwork still tilts with the pointer under reduced motion', async (t) => {
  const page = await pageFor(t, { reducedMotion: true })
  const original = await page.locator('.launcher-art').evaluate((node) => getComputedStyle(node).transform)
  await page.mouse.move(500, 100)
  await page.waitForFunction((original) => getComputedStyle(document.querySelector('.launcher-art')).transform !== original, original)
})

// The blink plays even under reduced motion: the OS "Animation effects" toggle
// drives the media feature, and gating the blink on it left the art frozen.
for (const fixture of [{}, { reducedMotion: true }]) {
  const label = fixture.reducedMotion ? ' even under reduced motion' : ''
  test(`background animation plays a blink and returns to the rest pose${label}`, async (t) => {
    const page = await pageFor(t, fixture)
    const result = await page.evaluate(async () => {
      let module
      try {
        module = await import('/src/lib/background-animation.ts')
      } catch {
        return { served: false }
      }
      const canvas = document.createElement('canvas')
      const animation = new module.BackgroundAnimation(canvas, {
        blinkMinDelayMs: 0, blinkMaxDelayMs: 0, blinkDurationMs: 150, maxFrameSize: 64,
      })
      animation.start()
      const ready = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000)
        const poll = setInterval(() => {
          if (canvas.dataset.ready !== 'true') return
          clearInterval(poll)
          clearTimeout(timeout)
          resolve(true)
        }, 10)
      })
      if (!ready) { animation.dispose(); return { served: true, ready: false } }
      const rest = canvas.toDataURL()
      let changed = 0
      let returned = false
      const deadline = performance.now() + 1500
      while (performance.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (canvas.toDataURL() !== rest) changed += 1
        else if (changed > 0) returned = true
      }
      animation.dispose()
      return { served: true, ready: true, changed, returned }
    })
    if (!result.served) return t.skip('frame-sequence module is not served by this target')
    assert.equal(result.ready, true, 'rest pose rendered')
    assert.ok(result.changed > 0, 'a blink changed the canvas')
    assert.equal(result.returned, true, 'the canvas returned to the rest pose')
  })
}
