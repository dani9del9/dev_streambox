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
        '**En el reproductor**, junto a sus botones (en Netflix, Prime Video, Disney+ y Movistar Plus+): para guardar, puntuar o anotar lo que estás viendo sin salir. En las series se guarda la serie, no el episodio.'],
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
    id: 'categorias', title: 'Categorías automáticas', icon: 'etiqueta', blocks: [
      'Cada título que guardas se mete solo en sus **categorías** (Drama, Comedia, Ciencia ficción, Documental, Infantil y familiar…) a partir de los géneros que da su plataforma. Como cada plataforma los llama distinto («Series dramáticas», «Dramas», «Drama»), StreamBox los junta en unas categorías comunes.',
      ['ul',
        '**En el menú lateral**, bajo tus listas, salen las categorías que tienen algún título, con cuántos hay. Al pulsar una ves todos sus títulos, con los mismos filtros que en una lista.',
        '**Filtro por categoría** en cada lista y en «Todos los títulos».',
        '**Bajo cada carátula** se ven sus categorías; pulsa una para ir a ella.',
        '**Corregir**: con el lápiz ✎ marcas o desmarcas categorías; «↺ Automáticas» vuelve a las de la plataforma.',
        '**Títulos que guardaste antes**: el botón «🏷 Categorizar mis títulos» busca sus géneros en su plataforma (tarda unos segundos por título).'],
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
    id: 'info', title: 'Info: notas en otras webs y datos', icon: 'estrella', blocks: [
      'Cada tarjeta del gestor tiene un botón **«Info ▾»** que despliega, sin ocupar sitio en la lista:',
      ['ul',
        '**Notas**: FilmAffinity (sobre 10, con sus votos), IMDb y Rotten Tomatoes (🍅 crítica y 🍿 público). Cada nota lleva a su página.',
        '**Datos**: título original, año, duración, país, dirección (o creación en las series), reparto, géneros y sinopsis (pulsa la sinopsis para leerla entera).'],
      'StreamBox busca el título en FilmAffinity y, a partir de ahí, encuentra el mismo en IMDb y Rotten Tomatoes. Lo que encuentra se guarda una semana; con ⟳ se vuelve a buscar.',
      ['tip', 'IMDb solo deja leer su nota si tu navegador ya ha entrado alguna vez en imdb.com; si no, verás su botón con una flecha para abrirlo. Si no encuentra un título (por ejemplo, porque la plataforma usa otro nombre), corrige el nombre con ✎ y pulsa ⟳.'],
    ],
  },
  {
    id: 'seguimiento', title: 'Seguir series (episodios nuevos)', icon: 'campana', blocks: [
      'Sigue las series que estás viendo y StreamBox te avisa cuando salgan **episodios o temporadas nuevas**:',
      ['ul',
        '**Seguir**: en el menú de StreamBox de una serie (en la plataforma) pulsa «🔔 Seguir», o la campana de su tarjeta en el gestor.',
        '**Siguiendo** (en la barra lateral del gestor): cada serie con sus temporadas, cuántos episodios tiene la última y la fecha del último episodio (y del próximo, si la plataforma ya lo anuncia).',
        '**Novedades**: cuando aparece algo nuevo la serie brilla con «✨ ¡Episodios nuevos!», sube arriba del todo y el icono de la extensión muestra un número. Al abrirla o pulsar «✓ Visto» deja de brillar.',
        '**Cuándo se comprueba**: cada 6 horas en segundo plano, cada vez que entras en la serie dentro de la plataforma y cuando pulsas «⟳ Comprobar ahora».'],
      'Cada plataforma da información distinta: **Prime Video** da la fecha de cada episodio y la del próximo; **Netflix** da el número de temporadas en segundo plano y los episodios cuando abres la serie; **Movistar Plus+** da el número de episodios de la última temporada y la fecha de cada uno; en **Disney+** se comprueba al abrir la serie en la plataforma (sin fechas, verás «Comprobado desde el…»).',
      ['tip', 'La primera comprobación solo guarda cómo está la serie: el aviso salta cuando, a partir de ahí, aparece algo nuevo.'],
    ],
  },
  {
    id: 'esta-noche', title: '¿Qué veo esta noche?', icon: 'palomitas', blocks: [
      'Dile cuánto tiempo tienes, qué te apetece, con quién lo ves y si quieres peli o serie: StreamBox te propone **3 títulos de los que ya tienes guardados** y te dice por qué (duración, tus estrellas, la nota de tu web afín, lo que le gusta a tu grupo, si se va pronto o si la estás viendo).',
      ['ul',
        'Las pelis que ya has visto (según tu diario) no se proponen. «En familia» evita el terror y el suspense.',
        'Si a algún título le falta la duración o las notas, se buscan antes de proponer. «🔄 Otras ideas» saca tres más.'],
    ],
  },
  {
    id: 'descubrir', title: 'Descubrir (recomendaciones)', icon: 'brujula', blocks: [
      'Te recomienda títulos que **aún no tienes**: parte de los que has puntuado (los de 4 o 5 estrellas tiran hacia lo parecido y los de 1 o 2 lo apartan) o de los que elijas tú. Los parecidos salen de JustWatch y salen primero los que se repiten entre varios de tus títulos.',
      ['ul',
        'Cada recomendación dice «Porque te gustó…» y en qué plataformas está; con «＋ Guardar» va directa a la lista que elijas.',
        '«Solo lo que puedo ver en mis plataformas» usa las que marcaste en Suscripciones. «✕» la descarta para siempre.'],
    ],
  },
  {
    id: 'reproducir-en', title: 'Reproducir en otro dispositivo', icon: 'tv', blocks: [
      'Al pasar el ratón por la carátula de un título sale **«📲 Reproducir en…»**: en este ordenador, en tus dispositivos registrados, en el móvil con un código QR, compartir o copiar el enlace. StreamBox **no envía el vídeo**: le dice al dispositivo que abra ese título en la app oficial de la plataforma, con tu cuenta.',
      ['ul',
        '**Tele con Google TV / Android TV / Fire TV**: en Ajustes → Mis dispositivos, «Añadir tele». Activa en la tele las opciones de desarrollador y la depuración, apunta su IP y pulsa «Probar» (la primera vez la tele pregunta si lo permites). Hace falta un pequeño ayudante en el ordenador: ejecuta native-host\\instalar.bat (necesita Node.js; descarga adb de Google si no lo tienes).',
        '**Móvil o tablet**: «Añadir móvil o tablet», instala la app gratuita ntfy y suscríbete al tema que te da StreamBox. Te llega una notificación; al tocarla se abre el título en la app.'],
      ['tip', 'Netflix ya no deja enviar desde su app del móvil a las teles con Google TV, y desde el navegador del ordenador ninguna plataforma deja enviar su vídeo: por eso la tele abre el título en su propia app. Si la app de la tele no acepta el enlace directo, StreamBox al menos abre la app.'],
    ],
  },
  {
    id: 'se-va', title: 'Se va pronto y dónde más está', icon: 'reloj', blocks: [
      'StreamBox vigila hasta cuándo sigue cada título de tus listas en su plataforma: cada pocos días en Netflix, Prime Video y Movistar Plus+, y en cualquier plataforma cuando abres una ficha que lo indica («Último día para verla…»).',
      ['ul',
        'Las tarjetas muestran «⏳ 5 días» (en rojo si quedan 7 o menos) y «¿Qué veo esta noche?» tiene la lista completa de lo que se va.',
        'Te llega un **aviso de escritorio** 7 días antes (se puede desactivar en Ajustes → Avisos).',
        '**Dónde más está**: en «Info» y en «Se va pronto» ves en qué otras plataformas de suscripción está cada título (según JustWatch) con enlace directo.'],
    ],
  },
  {
    id: 'diario', title: 'Mi diario, tu resumen y tu web afín', icon: 'grafica', blocks: [
      'Mientras reproduces algo, StreamBox apunta los minutos de cada título y los episodios (solo en tu navegador). En **Mi diario** ves horas, títulos, rachas, reparto por plataforma y género, lo que más has visto y un calendario de actividad.',
      ['ul',
        '**✨ Tu resumen del año**: tarjetas a pantalla completa con tus horas, tu plataforma, tu título y tu género del año.',
        '**¿A qué web se parece tu gusto?**: compara tus estrellas con FilmAffinity, IMDb y Rotten Tomatoes. Con la más parecida puedes ordenar cualquier lista con «Según tu web afín».'],
    ],
  },
  {
    id: 'maraton', title: 'Maratones', icon: 'rayo', blocks: [
      'En la **Cola**, «＋ Nuevo maratón»: eliges una serie, los episodios que te quedan y hasta cuándo quieres terminarla. StreamBox reparte los episodios por días, te dice si vas al día, adelantado o atrasado (según lo que ves), y «▶ Ver los de hoy» pone en la cola los episodios que tocan y la arranca.',
    ],
  },
  {
    id: 'suscripciones', title: 'Suscripciones', icon: 'dinero', blocks: [
      'Marca qué plataformas tienes y su precio. StreamBox calcula cuántas horas tienes pendientes en cada una, cuántas has visto en los últimos 60 días y **cuánto te cuesta cada hora vista**, y te aconseja (darte de baja, activarla un mes, el día de un estreno que sigues…).',
      'El **plan de rotación** propone una plataforma por mes según lo que tienes pendiente y tu ritmo, con lo que te ahorrarías frente a tenerlas todas.',
    ],
  },
  {
    id: 'marcadores', title: 'Marcadores', icon: 'marcador', blocks: [
      'Mientras ves algo, abre el menú de StreamBox en el reproductor: el vídeo se pausa en ese momento. Afina con −10s/−1s/+1s/+10s (o mueve la barra del reproductor: la hora del botón se actualiza) y pulsa **«🔖 Marcar»** (con una nota si quieres); al cerrar el menú sigue reproduciéndose. En **Marcadores** los tienes todos; «▶ Ir» abre el título y salta a ese segundo.',
    ],
  },
  {
    id: 'compartir', title: 'Listas compartidas', icon: 'grupo', blocks: [
      'En una lista, **«👥 Compartir»** te da un código para mandar a quien quieras. Esa persona lo pega en «📥 Importar lista compartida» (barra lateral), puntúa con estrellas y te devuelve su código: al importarlo, cada título muestra los votos de todos y la media, puedes ordenar por «Votos del grupo» y «¿Qué veo esta noche?» tiene en cuenta lo que le gusta al grupo.',
      ['tip', 'No hay servidor: los códigos viajan por donde queráis. Cada vez que alguien puntúe, que vuelva a mandar su código para actualizar sus votos.'],
    ],
  },
  {
    id: 'juntos', title: 'Ver juntos', icon: 'grupo', blocks: [
      'Para ver lo mismo cada uno en su casa: en el reproductor, menú de StreamBox → **«👥 Ver juntos»**. Uno pulsa «Crear invitación» y se la manda al otro; el otro la pega, pulsa «Unirme» y devuelve la respuesta; el primero la pega y pulsa «Conectar».',
      ['ul',
        'Desde ese momento, play, pausa y saltos van sincronizados, y podéis mandaros reacciones (😂 😱 ❤️…).',
        'Si uno cambia de episodio, al otro le aparece «Ir a lo mismo».'],
      ['tip', 'La conexión es directa entre los dos navegadores, sin servidores de StreamBox. Algunas redes muy cerradas (de empresa, por ejemplo) pueden bloquearla. Cada uno necesita su propia cuenta en la plataforma.'],
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
        '**Movistar Plus+** (ver.movistarplus.es): miniaturas, ficha y reproductor. En las miniaturas de un episodio se guarda su serie. En la cola, StreamBox abre la ficha y pulsa «Ver ahora» por ti.',
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
