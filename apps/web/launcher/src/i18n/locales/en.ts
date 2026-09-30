import type { zh } from './zh'

/** English dictionary. Must mirror every key of the default (zh) dictionary. */
export const en: Record<keyof typeof zh, string> = {
  'app.title': 'DSH Launcher',
  'titlebar.close': 'Hide to tray',
  'lang.toggle': '中',

  'status.title': 'Development server',
  'status.subtitle': 'Local dsh web process',
  'status.state.stopped': 'Stopped',
  'status.state.starting': 'Starting',
  'status.state.running-managed': 'Running',
  'status.state.running-external': 'Running externally',
  'status.state.stopping': 'Stopping',
  'status.endpoint': 'Endpoint',
  'status.port': 'Port',
  'status.process': 'Process',
  'status.waiting': 'Waiting to start',
  'status.notAssigned': 'Not assigned',
  'status.notRunning': 'Not running',
  'status.externalProcess': 'External process',
  'status.pid': 'PID {pid}',

  'controls.title': 'Server controls',
  'controls.subtitle': 'Common workspace commands',
  'controls.install': 'Install',
  'controls.build': 'Build',
  'controls.start': 'Start',
  'controls.stop': 'Stop',
  'controls.restart': 'Restart',
  'controls.working': 'Working',

  'log.done.title': 'Command completed',
  'log.fail.title': 'Command failed',
  'log.done.desc': 'The command completed successfully',
  'log.fail.desc': 'The command returned an error',
  'log.lines': '{n} lines',

  'footer.brand': 'DeepSeek Harness',
  'footer.polling': 'Refreshing every 2s',
}
