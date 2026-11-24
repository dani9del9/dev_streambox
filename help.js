// StreamBox — Contenido de la página de Ayuda del gestor.
// Mantener al día con cada cambio de la extensión.
// Formato: cada sección tiene id, título, icono (de svg-icons.js) y bloques:
//   'texto'               → párrafo (admite **negrita**)
//   ['ul', 'a', 'b', …]   → lista
//   ['tip', 'texto']      → nota destacada
const SB_HELP = [
  {
    id: 'inicio', title: 'Qué es StreamBox', icon: 'casa', blocks: [
      'StreamBox te deja crear **tus propias listas** de pelis y series («Pelis que me han encantado», «Ver en Navidad», «Documentales de deporte»…) con el icono y el color que quieras. Una lista puede **mezclar plataformas**: cada título recuerda de dónde es y, al pulsarlo, se abre en su plataforma.',
      'Funciona en dos sitios:',
      ['ul',
        '**Dentro de cada plataforma**: un botón en las miniaturas, en la vista previa y en la ficha de cada título para añadirlo a tus listas y ver en cuáles está ya.',
        '**En el gestor** (esta página): para ver, ordenar, filtrar y editar tus listas, y para los ajustes. Se abre con el icono de la extensión.'],
    ],
  },
  {
    id: 'listas', title: 'Crear y editar listas', icon: 'lista', blocks: [
      ['ul',
        '**Nueva lista**: botón «+ Nueva lista» del gestor, o escribe un nombre en «Nueva lista…» del menú de StreamBox dentro de la plataforma (el título que estabas mirando entra directamente).',
        '**Nombre**: se cambia escribiendo en el campo grande de arriba de la lista.',
        '**Icono y color**: pulsa el icono grande. Puedes elegir entre cientos de **emojis**, **iconos de línea** pintados con el color que elijas, **texto** (hasta 3 caracteres), una **imagen** tuya o la **carátula** de uno de tus títulos. «Fondo de color» y «Redondo» cambian la forma.',
        '**Orden de las listas**: arrástralas en el menú lateral.',
        '**Borrar lista**: botón «Borrar lista». Los títulos que estén también en otras listas se conservan.'],
    ],
  },
  {
    id: 'anadir', title: 'Añadir títulos desde las plataformas', icon: 'mas', blocks: [
      'En la web de cada plataforma compatible verás el botón de StreamBox (el marcapáginas entre corchetes):',
      ['ul',
        '**En las miniaturas**: un botón pequeño en la esquina de cada carátula. Si el título ya está en alguna lista se ven siempre sus iconos; si no, el botón aparece al pasar el ratón.',
        '**En la vista previa** que sale al dejar el ratón sobre una miniatura, junto a los botones de la plataforma.',
        '**En la ficha** del título (al pulsar «Más información» o al abrir su página) y en el cartel grande de la portada de Netflix: «Añadir a lista» o «En 2 listas».',
        '**En el reproductor**, junto a sus botones (en Netflix, Prime Video y Disney+): para guardar, puntuar o anotar lo que estás viendo sin salir. En las series se guarda la serie, no el episodio.'],
      ['tip', 'Si la vista previa tapa el botón de la miniatura, usa el botón que aparece dentro de la propia vista previa.'],
      'Al pulsarlo se abre un menú con tus listas: marca o desmarca las que quieras. Al guardar un título se apuntan su plataforma, enlace, carátula, tipo (peli o serie) y año.',
    ],
  },
  {
    id: 'gestor', title: 'Ver, ordenar y filtrar tus listas', icon: 'cuadricula', blocks: [
      ['ul',
        '**Abrir un título**: pulsa su carátula o su nombre y se abre en su plataforma, en una pestaña nueva.',
        '**Ordenar**: «Mi orden» te deja **arrastrar** las carátulas; también puedes ordenar por fecha en que se añadieron, título, año o plataforma. El orden elegido se guarda en cada lista.',
        '**Copiar a otra lista**: arrastra una carátula y suéltala sobre una lista del menú lateral.',
        '**Meter o sacar de listas**: bajo cada título están los iconos de todas tus listas; los encendidos son las listas en las que está. Púlsalos para cambiarlo.',
        '**Buscador y filtros**: busca por título o año, y filtra por plataforma y por tipo (pelis o series).',
        '**Todos los títulos**: en el menú lateral, todo lo que has guardado junto, con los mismos filtros y un filtro por lista.'],
    ],
  },
  {
    id: 'puntuacion', title: 'Mi puntuación y mis notas', icon: 'estrella', blocks: [
      'Puntúa cada título de 1 a 5 estrellas y apúntale **notas** (quién te lo recomendó, por qué capítulo vas…): en el menú de StreamBox dentro de la plataforma, a la vez que eliges sus listas, o en el gestor (estrellas bajo la carátula y notas con el lápiz ✎). Pulsar otra vez la misma estrella quita la puntuación.',
      'Si puntúas o escribes una nota antes de elegir una lista, se guardan en cuanto lo añades a una. Las notas también se buscan con el buscador del gestor.',
      'Es una puntuación **solo tuya**: no se envía a la plataforma. Luego puedes **filtrar** por estrellas («★★★★ o más», «Sin puntuar») y **ordenar** por «Mi puntuación», en cada lista y en «Todos los títulos».',
    ],
  },
  {
    id: 'cola', title: 'Cola de reproducción', icon: 'cola', blocks: [
      'Para ver varias pelis o capítulos seguidos sin tener que buscarlos:',
      ['ul',
        '**Añadir**: con el botón de cola de cada carátula en el gestor, con «＋ Todo a la cola» en una lista (añade lo que se ve, en ese orden) o con «＋ Añadir a la cola» del menú de StreamBox dentro de las plataformas.',
        '**Series**: elige cuántos episodios ver antes de pasar al siguiente título (1, 2, 3… o toda la serie). El valor por defecto se cambia en Ajustes.',
        '**Reproducir**: «▶ Reproducir la cola» en el gestor o «▶ Ver cola» en el menú de StreamBox. Se abre el primer título.',
        '**Al terminar** una película (cuando salen los créditos) o los episodios elegidos de una serie aparece «Siguiente en tu cola» con una cuenta atrás de 8 segundos: «Ver ahora» o «Cancelar» para quedarte.',
        '**Durante la reproducción**, al mover el ratón sale arriba una barra con la cola: ⏭ salta al siguiente y ■ la pone en pausa.',
        'Lo que terminas **se queda en su sitio en blanco y negro**, marcado como visto, y la cola sigue por el primero sin ver. Con «↺ Volver a ver» lo vuelves a poner pendiente y con «Quitar los vistos» limpias la cola.',
        'Si sales del reproductor, la cola se pone en pausa para que otro vídeo que veas no la haga avanzar.'],
      'La cola puede mezclar plataformas: al pasar a un título de otra plataforma se abre en ella.',
      ['tip', 'La cola es de este navegador: no se sincroniza con los demás.'],
    ],
  },
  {
    id: 'reproductor', title: 'Omitir introducciones, resúmenes y pasar de episodio', icon: 'play', blocks: [
      'En Ajustes → «Reproductor» hay tres casillas (desactivadas al principio):',
      ['ul',
        '**Omitir la introducción**: pulsa «Omitir introducción» en cuanto la plataforma lo ofrece.',
        '**Omitir los resúmenes**: pulsa «Omitir resumen» («Anteriormente en…»).',
        '**Pasar automáticamente al siguiente episodio**: al llegar a los créditos pulsa «Siguiente episodio» sin esperar a la cuenta atrás.'],
      'Cada vez que lo hace verás un aviso abajo. Solo pulsa botones que la propia plataforma muestra: si no ofrece saltar, no se salta nada.',
    ],
  },
  {
    id: 'editar', title: 'Editar los datos de un título', icon: 'lapiz', blocks: [
      'Con el lápiz ✎ de cada título puedes corregir el **nombre**, el **tipo**, el **año**, la **carátula** y el **enlace**. «Recuperar datos» vuelve a pedirlos a la plataforma.',
      'StreamBox intenta completar solo el tipo y el año al guardar el título; si alguno no aparece, verás «Sin tipo ni año · completar» y puedes rellenarlo a mano.',
    ],
  },
  {
    id: 'enlace', title: 'Añadir por enlace', icon: 'enlace', blocks: [
      'Al final de cada lista puedes **pegar el enlace** de un título (por ejemplo https://www.netflix.com/title/80057281 o el de la barra de direcciones con ?jbv=…) y pulsar «Añadir». StreamBox reconoce la plataforma y busca los datos del título.',
    ],
  },
  {
    id: 'plataformas', title: 'Plataformas compatibles', icon: 'tv', blocks: [
      ['ul',
        '**Netflix**: miniaturas de todas las filas, búsqueda y «Mi lista», vista previa, ficha, cartel de la portada y reproductor.',
        '**Prime Video** (primevideo.com y Amazon en /gp/video): miniaturas, ficha y reproductor.',
        '**Disney+**: miniaturas, ficha y reproductor. Como Disney+ no dice en el reproductor qué título es, StreamBox lo reconoce por la última ficha que abriste en esa pestaña o por su nombre. En la cola, los títulos de Disney+ abren su ficha y StreamBox pulsa «Reproducir» por ti (sigue la serie por donde ibas).',
        '**Próximamente**: Max.'],
      'En Ajustes → «En las plataformas» puedes desactivar el botón de las miniaturas o una plataforma entera.',
      ['tip', 'Las plataformas cambian su web a menudo. Si un botón deja de salir, recarga la página; si sigue sin salir, la plataforma ha cambiado algo y StreamBox necesita una actualización.'],
    ],
  },
  {
    id: 'apariencia', title: 'Apariencia e idioma', icon: 'paleta', blocks: [
      ['ul',
        '**Tema**: claro, oscuro o automático (sigue al sistema en el gestor).',
        '**Colores**: dos colores en degradado para botones, títulos y etiquetas, aquí y dentro de las plataformas.',
        '**Idioma**: español, inglés o gallego.'],
    ],
  },
  {
    id: 'sync', title: 'Sincronizar y copias de seguridad', icon: 'nube', blocks: [
      ['ul',
        '**Sincronizar entre navegadores**: activa la casilla en Ajustes y tus listas y títulos se guardan en tu cuenta del navegador (Chrome, Edge o Firefox con su sincronización activada). Si guardas muchos títulos, las carátulas no se sincronizan y cada navegador las recupera al volver a ver el título.',
        '**Exportar JSON**: guarda en un archivo todas tus listas, iconos, títulos y ajustes.',
        '**Importar JSON**: «Aceptar» combina el archivo con lo que ya tienes; «Cancelar» lo reemplaza todo.'],
    ],
  },
  {
    id: 'privacidad', title: 'Privacidad', icon: 'escudo', blocks: [
      'StreamBox guarda todo en tu navegador y no envía tus listas a ningún servidor (salvo a tu cuenta del navegador si activas la sincronización). Para completar los datos de un título solo consulta la página pública de ese título en su plataforma.',
    ],
  },
];
