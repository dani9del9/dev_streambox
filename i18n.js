// StreamBox — idiomas (español, inglés, gallego).
// Los textos del código están en español y se traducen con T('texto', ...args); los {0}, {1}… se sustituyen por los argumentos.
// TN(n, 'singular', 'plural', ...args) elige la forma según n (que siempre es {0}).
// Los diccionarios están en i18n-en.js e i18n-gl.js (claves = texto en español).
var SB_LANGS = [['es', 'Español'], ['en', 'English'], ['gl', 'Galego']];
var SB_DICT = typeof SB_DICT !== 'undefined' ? SB_DICT : {};
var SB_LANG = (() => {
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'es').toLowerCase();
  return nav.startsWith('gl') ? 'gl' : nav.startsWith('es') || nav.startsWith('ca') || nav.startsWith('eu') ? 'es' : 'en';
})();
var SB_DEFAULT_LANG = SB_LANG;
function T(s, ...args) {
  if (s == null) return s;
  let out = s;
  if (SB_LANG !== 'es') { const d = SB_DICT[SB_LANG]; if (d && d[s] != null) out = d[s]; }
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : '')) : out;
}
function TN(n, one, many, ...rest) { return T(Number(n) === 1 ? one : many, n, ...rest); }
T.setLang = l => { SB_LANG = ['es', 'en', 'gl'].includes(l) ? l : SB_DEFAULT_LANG; if (typeof document !== 'undefined' && document.documentElement && location.protocol.endsWith('extension:')) document.documentElement.lang = SB_LANG; return SB_LANG; };
T.lang = () => SB_LANG;
T.locale = () => ({ es: 'es-ES', en: 'en-GB', gl: 'gl-ES' })[SB_LANG];
// Nombre del mes (0-11) en el idioma actual, en minúscula salvo en inglés
const SB_MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  gl: ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño', 'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro'],
};
T.month = m => SB_MONTHS[SB_LANG][m];
// Iniciales de los días de la semana empezando en lunes
T.weekdays = () => ({ es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], gl: ['L', 'M', 'M', 'X', 'V', 'S', 'D'] })[SB_LANG];
// «3 de marzo» / «3 March» / «3 de marzo»
T.dayMonth = (d, m) => SB_LANG === 'en' ? `${d} ${T.month(m)}` : `${d} de ${T.month(m)}`;
