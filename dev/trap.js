/* Installs error traps before any application script runs. */
window.__errors = [];
function record(prefix, e) {
  var stack = (e && e.error && e.error.stack) || (e && e.reason && e.reason && e.reason.stack) || '';
  window.__errors.push(prefix + ': ' + (e && e.message || (e && e.reason && e.reason.message) || 'error') +
    ' @ ' + ((e && e.filename) || '?').split('/').pop() + ':' + ((e && e.lineno) || 0) +
    (stack ? '\n    ' + stack.split('\n').slice(0, 4).join('\n    ') : ''));
}
window.addEventListener('error', function (e) { record('error', e); }, true);
window.addEventListener('unhandledrejection', function (e) { record('unhandledrejection', e); });
