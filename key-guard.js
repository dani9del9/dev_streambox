// StreamBox — se ejecuta en el «mundo» de la página antes que la propia web.
// Las webs de streaming capturan el teclado (atajos del reproductor) y vigilan el foco (las vistas previas
// y el reproductor lo devuelven a su sitio), así que no se podía escribir en los campos de StreamBox
// («Nueva lista…», notas). Para lo que pasa dentro de nuestros elementos (.sb-ui):
//  · teclas: la web ya no puede cancelarlas ni frenarlas (siguen llegando a nuestro campo);
//  · foco y pulsaciones: la web ni se entera (no puede quitarnos el foco ni cerrar nada por ello).
(() => {
  const inUi = n => { try { return !!(n && n.closest && n.closest('.sb-ui')); } catch { return false; } };
  const ours = e => {
    try { return e.composedPath().some(n => n && n.classList && n.classList.contains('sb-ui')); } catch { return false; }
  };
  const noop = () => {};
  for (const t of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend', 'paste', 'cut', 'copy']) {
    window.addEventListener(t, e => {
      if (!ours(e)) return;
      Object.defineProperty(e, 'preventDefault', { value: noop, configurable: true });
      Object.defineProperty(e, 'stopImmediatePropagation', { value: noop, configurable: true });
      Object.defineProperty(e, 'stopPropagation', { value: noop, configurable: true });
    }, true);
  }
  // Foco: ni el que entra en nuestros campos ni el que sale de la web hacia ellos llega a la web
  for (const t of ['focusin', 'focusout']) {
    window.addEventListener(t, e => {
      if (ours(e) || inUi(e.relatedTarget)) e.stopImmediatePropagation();
    }, true);
  }
  // Pulsaciones dentro de StreamBox: la web no las ve (así no cierra su vista previa ni recoloca el foco)
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart']) {
    window.addEventListener(t, e => { if (ours(e)) e.stopImmediatePropagation(); }, true);
  }
})();
