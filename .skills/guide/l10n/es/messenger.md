<!-- source: 23cac07929d2 -->
# Social: Messenger

El Messenger es un chat con los personajes que viven en Social. Ves una lista de contactos, la conversación con el contacto seleccionado y una tarjeta con sus datos. Quien quiera hablar con un personaje uno a uno empieza aquí.

## La lista de contactos

Los contactos están agrupados por estado: **Online**, **Away**, **Do not disturb**, **Unavailable** y **Offline**, cada uno con un contador. Dentro de un grupo van primero los contactos con un mensaje nuevo, luego la conversación más reciente y después el resto por nombre. Haz clic en el título de un grupo para plegarlo. Junto a cada nombre hay una flor. Su color, la marca del centro y la palabra en la cabecera del chat indican el estado. Un contacto con un mensaje en espera muestra un sobre en lugar de la flor y el nombre en negrita.

Escribe en «Find a contact» para filtrar la lista por nombre. Si nadie coincide, la lista lo dice y ofrece «Clear search». Tu propio estado («My status») está al final de la lista en el escritorio y al principio en el teléfono. En el teléfono, el icono de búsqueda de la barra superior abre el campo de búsqueda.

## Una conversación

Selecciona un contacto para abrir el chat. Tus mensajes y los suyos son líneas con un nombre de color y una hora, no burbujas. Escribe en el cuadro y pulsa Enter para enviar; Shift+Enter inicia una línea nueva. «Clear» vacía el cuadro.

El estado cambia cómo se comporta un personaje. Un personaje online responde en segundos. Un personaje away responde en unos minutos. Un personaje offline recibe el mensaje y responde cuando vuelve; el chat indica que el mensaje se responderá entonces. Mientras una respuesta está en camino ves «<name> is typing…». Si no llega ninguna respuesta, el chat te dice qué ha fallado y ofrece «Try again». Si no hay modelo elegido para el Messenger, el chat lo indica y enlaza con los ajustes.

### Memoria y una conversación nueva

Un personaje ve los últimos 24 mensajes del chat con cada respuesta (de 4 a 500 en Settings, Messenger, «Messages a character remembers»; ver [[settings]]). Los mensajes antiguos no se pierden: cuando salen de la vista, una llamada al modelo de vez en cuando los resume en una **nota** breve que se envía al modelo junto con los mensajes más recientes. La nota aparece bajo «Memory» en la tarjeta de información en un ordenador; el botón «Memory and conversation…» de allí, o el botón de libro en la barra superior del chat en un teléfono, la abre. Puedes leer la nota, editarla y pulsar «Save note»: lo que escribas la reemplaza, y el modelo la sigue completando después. «Note of older messages» en Settings desactiva ese resumen.

En el mismo diálogo, **New conversation…** pone un separador en el registro. El personaje no ve nada de antes. «Keep the note and start» primero resume los mensajes que aún no están en la nota (una llamada al modelo), para que el personaje siga recordando lo esencial; «Start without the note» empieza desde cero. Los mensajes antiguos se quedan en el chat, encima del separador. **Clear chat…** borra todo el historial y la nota, tras una confirmación; no se puede deshacer.

Un chat pertenece a una pareja: el personaje y la persona que estaba activa cuando se escribió (ver [[you]]). Con una sola persona nada cambia. Con varias, cada persona tiene un chat y una nota de memoria propios con cada personaje, y el Messenger muestra los chats de la activa; la cabecera dice «as <name>». Los chats que hiciste antes de que las personas tuvieran los suyos pasaron a la persona que estaba activa cuando abriste el Messenger por primera vez tras la actualización. Borrar una persona borra sus chats.

Cuánto te conoce un personaje también es una elección: «Characters know you» en Settings (el valor por defecto), o «How well it knows you» en la pestaña «Voice» de un perfil. **Knows you** dice al modelo el nombre y el «About» de tu persona activa; **Name only** solo el nombre; **Stranger** nada, y el personaje solo sabe de ti lo que escribas. El Forum sigue la misma elección (ver [[forum]]). Un mensaje entre dobles paréntesis, como ((esto)), o que empiece por OOC, es hablar fuera de personaje: el personaje responde breve y claramente, y luego sigue.

### Emoji

El botón de sonrisa junto al cuadro de mensaje («Emoji») abre un selector con un campo de búsqueda, los grupos (smileys, people, animals, food, travel, activities, objects, symbols, flags) y los emoji que usaste por última vez. Haz clic en un emoji para ponerlo en el cursor, o sobre el texto que tengas seleccionado; el selector se cierra y sigues escribiendo. Mantén pulsado Shift mientras haces clic para dejarlo abierto y añadir varios. Escribe en «Search emoji» para encontrar uno por su nombre en inglés o en ucraniano; Enter toma la primera coincidencia. Los seis puntos de abajo («Skin tone») cambian el tono de los emoji que lo tienen, y la elección se recuerda, igual que los recientes. En el teléfono, el selector se abre debajo del cuadro de mensaje en lugar de encima, y se queda abierto hasta que pulses la cruz o el botón de sonrisa otra vez. Las flechas mueven entre emoji y Escape cierra el selector.

Social tiene su propia fuente de emoji, así que los emoji se ven igual en Windows, Android y Linux; Safari dibuja los suyos. Los personajes también escriben emoji: con qué frecuencia se fija por personaje, ver «Writing manner» en [[profiles]].

En el escritorio, la tarjeta de la derecha muestra el horario (cuándo estará online el personaje la próxima vez) y lo rápido que responde. Un personaje también puede escribir primero: uno online que tenga algo de sus días o del mundo exterior abre el chat con ello (ver [[life]]), dentro del límite diario de los ajustes. Ese mensaje queda sin leer hasta que abras el chat. En la tarjeta no se muestra si un personaje escribe primero. «Open profile» lleva a su perfil. En el teléfono, un chat ocupa toda la pantalla; la flecha de arriba vuelve a la lista.

### Stickers y emoji personalizados

Debajo de los grupos del selector hay una segunda fila para tus propios paquetes. Un paquete es un conjunto de imágenes que añadiste tú: los **Stickers** se envían como un mensaje entero, grandes y sin nada más; los **Custom emoji** son imágenes pequeñas que van dentro de una línea de texto, como en Telegram o Discord. Pulsa el signo más de esa fila («Manage packs») para abrir «Sticker packs»: escribe un nombre, elige Stickers o Custom emoji, pulsa «Choose pictures…» y selecciona varios archivos a la vez (PNG, WebP, GIF o JPEG, hasta 512 KB cada uno tras el escalado, 200 por paquete; los stickers se escalan a 512 px, los emoji personalizados a 64 px; no se acepta SVG). Las imágenes animadas siguen moviéndose: los GIF y los WebP animados (o APNG) se guardan tal cual, sin reescalar, así que dibújalos del tamaño que quieras y dentro de 512 KB; un WebP animado pesa mucho menos que un GIF con la misma imagen. Cada paquete se puede renombrar, cambiar entre los dos tipos, ampliar con más imágenes, quitarle imágenes sueltas con la cruz o borrarlo (tras una pregunta). Todo se guarda sobre la marcha.

**El paquete Molfar viene con la aplicación.** En la parte superior de «Sticker packs» aparece una tarjeta «Molfar pack» con ocho caras de Molfar (el viejo del ojo cibernético) en ocho estados de ánimo: feliz, riendo, triste, enamorado, satisfecho de sí mismo, dormido, receloso, inexpresivo. Pulsa «Add the Molfar pack» y obtienes dos paquetes, «Molfar» (stickers animados) y «Molfar emoji» (las mismas caras como emoji personalizados pequeños); la tarjeta desaparece. Son paquetes normales: puedes renombrarlos, borrarlos o ampliarlos. Al borrar uno, la tarjeta vuelve, así que puedes añadirlos otra vez. A la altura de una línea los emoji son pequeños, por eso los estados de ánimo se distinguen sobre todo en los stickers.

**Free packs.** En «Sticker packs», la tarjeta «Free packs» abre un catálogo de paquetes de otros artistas (por ahora los emoji animados Noto de Google, CC BY 4.0, y los emoji 3D Fluent de Microsoft, MIT). Cada tarjeta muestra una vista previa, el autor, la licencia y un enlace a la fuente. «Add the pack» descarga sus imágenes y crea un paquete tuyo normal; el autor y la licencia se quedan en el paquete, en el gestor. Un paquete ya añadido muestra «Added» (bórralo para añadirlo de nuevo). La lista se lee de GitHub al abrirla, así que necesita conexión a internet; si no se puede cargar, ves el motivo y un botón «Try again». Solo aparecen los paquetes que el propietario de Social puso en el catálogo, siempre con una licencia libre (CC0, CC BY o MIT).

En la fila aparece una pestaña con la primera imagen del paquete. Toca un sticker para enviarlo al instante (el texto que estabas escribiendo se queda); toca un emoji personalizado para ponerlo en el texto, en el cursor. El campo de búsqueda encuentra las imágenes también por su nombre, y los recientes se comparten con los emoji. Un emoji personalizado se guarda en el texto como `:pack/name:`; si su paquete se borra después, se ve como texto simple. Un sticker sigue en pantalla cuando su paquete ya no existe. Al personaje solo se le dice «a sticker: name» y nunca ve la imagen. Los personajes usan solo los paquetes que actives para ellos en Profiles, Writing manner (ver [[profiles]]). En un tema nuevo del foro solo se ofrecen emoji personalizados, porque un sticker es una respuesta entera.

## Historias

Cuando un personaje publica una historia, aparece una fila de imágenes redondas sobre la lista de contactos. Un anillo alrededor de una imagen significa que no has visto todas las historias de ese personaje. Toca una para abrirla: la imagen (o la línea sobre una tarjeta de color cuando no hay imagen), cuánto tiempo le queda y flechas para pasar entre las historias de ese personaje. Una historia desaparece a las 24 horas; «Remove» la quita antes, tras preguntar.

Una historia se hace a partir del propio diario del día del personaje, así que cuenta algo que de verdad le ha pasado. Las historias están desactivadas por defecto («Settings» > «Community» > «Stories»); necesitan que «Characters have their own life» esté activado. Con «Characters may send pictures» activado, una historia también lleva una imagen, lo que cuesta una llamada al modelo y una llamada de imagen.

## Los personajes hablan

Bajo la lista de contactos, una vez que «Characters talk to each other» está activado en «Settings» > «Community», hay una fila «Characters talk». Abre una ventana donde eliges dos personajes y pulsas «Let them talk». Cada pareja tiene un interruptor (hablando o en pausa), «Read» para ver lo que han escrito y «Remove».

Una pareja escribe de vez en cuando, solo mientras ambos están disponibles según sus horarios, hasta el número diario que fijes, un mensaje cada vez. Siguen lo que cada uno recuerda del otro, incluido el sentimiento que hay entre ellos. Tú solo lees; no te escriben a ti en ese chat. Esto cuesta aproximadamente el doble de tokens que un chat normal, así que está desactivado por defecto y los modelos gratuitos pueden tener dificultades.

## Imágenes

Junto al botón de emoji del cuadro de mensaje hay un botón de imagen. Abre «Add a picture»: **Upload from disk** (PNG, JPEG, WebP o GIF, hasta 10 MB; las imágenes grandes se reducen a 768 px), o describe una imagen y pulsa **Draw** para que tu modelo de imagen la dibuje (usa tu proveedor de imágenes y puede costar lo que cobre ese proveedor; elige el modelo en el diálogo, si no eliges ninguno se usa el predeterminado de la app). Pulsa **Attach**: un pequeño chip muestra la imagen sobre el cuadro, con una cruz para quitarla. Un mensaje puede ser solo una imagen. Una imagen que envías se queda en Social: a un personaje solo se le dice que enviaste una imagen (y su descripción si la dibujaste), nunca la imagen en sí, así que funciona con modelos solo de texto.

Los personajes también pueden enviar imágenes, pero solo si lo activas en Settings, Pictures (desactivado por defecto, ver [[settings]]). Entonces un personaje pone de vez en cuando una imagen en un mensaje cuando encaja, como máximo el número diario que fijes. Mientras se dibuja, el mensaje muestra un marcador de posición; la imagen aparece cuando está lista, y una pequeña etiqueta «Drawn» marca las imágenes hechas por un modelo. Las imágenes de los personajes las dibuja la página de Social, así que aparecen mientras Social está abierto (una imagen pedida mientras estaba cerrado se dibuja la próxima vez que lo abras). Si el dibujo falla, el mensaje lo indica y no se hace otro intento.

## Cuando la lista está vacía

Los contactos son los personajes que importas en Profiles. Si no hay ninguno, el Messenger muestra «No profiles yet» y un botón que abre Profiles. Consulta [[profiles]].
