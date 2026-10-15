# Vídeo de fondo de la pantalla de letras

La pantalla de letras puede poner el **videoclip oficial** de la canción detrás
de la letra en vez de la portada difuminada. Es un ajuste de letras, no una
pantalla nueva:

- **⋮ → Apariencia → «Vídeo de fondo»** (interruptor, apagado por defecto).
- **Ajustes → Apariencia → Letras → «Vídeo de fondo»**.

Con el ajuste encendido, al abrir las letras la app prepara el vídeo en segundo
plano (con su progreso) y, en cuanto está listo, el fondo pasa de la portada al
vídeo en movimiento. El `<audio>` de la app sigue siendo la fuente sonora y el
reloj de referencia: el vídeo va **mudo** y solo corrige su deriva contra él, así
que nunca se oyen dos pistas a la vez.

## Aspecto: velo y cristal

- **El vídeo va un punto atenuado** (velo `.36/.55/.78`, frente al `.5/.7/.9` de
  la portada) para que la letra blanca gane contraste sobre el movimiento del
  clip.
- **Con el vídeo de fondo, la barra lateral (portada + cola) y los botones de
  arriba (⋮ y cerrar) llevan su propio cristal** (portada+cola `blur(20px)`,
  botones `blur(6px)`): si no, el clip se movería por detrás de la portada y de
  la lista y no se leerían bien.
- **Sin vídeo no hay cristal por pieza**: con la portada difuminada de fondo
  vuelve el aspecto de siempre, el cristal cubriendo todo. Esto incluye a las
  canciones sin videoclip oficial (o cuyo vídeo aún se está preparando): la
  portada manda y nada lleva cristal local.

## Videoclip oficial, no el «art track»

El vídeo de una canción en YouTube Music suele ser un *art track*
(`MUSIC_VIDEO_TYPE_ATV`): la portada hecha vídeo, con fotogramas estáticos. Por
eso el backend busca el **videoclip oficial** de verdad:

- `videoclip.py` consigue la ficha de la canción (`get_watch_playlist` y, si
  falla, `get_song`), busca vídeos con su título y artista y puntúa cada
  candidato con reglas duras: mismo título, que no sea un canal «- Topic» ni un
  `ATV`, ni una versión anunciada como no oficial (letra, cover, directo, remix,
  karaoke…), y que lo suba el artista o un sello/VEVO con el artista en el
  título. Entre los válidos ganan la marca `OMV` de YouTube y la duración.
- **La duración tiene que cuadrar** (±5 s). Si el videoclip dura bastante más o
  menos que la canción, lleva intro, outro o es otra mezcla: las dos líneas de
  tiempo no cuadran y el fondo se vería desfasado toda la canción, así que el
  candidato se descarta (aunque sea el videoclip oficial).
- La resolución se cachea en la tabla `videoclip_oficial`: `oficial_id` vacío
  significa «se buscó y esta canción no tiene videoclip». Los fallos de red no
  se cachean (se reintentan al volver a abrir).
- **Si la canción no tiene videoclip oficial se queda la portada** y no se
  descarga nada.

## Motor de vídeo

`video_fondo.py` descarga vídeo + audio con yt-dlp y los muxea con ffmpeg en un
único MP4 (`VIDEO_DIR/{videoId}.mp4`, tope 1080p, escaleras de formatos que
degradan sin fallar) y lo cachea con evicción LRU (6 GB). Las rutas del motor:

- `POST /video/prepare/{id}`: lanza la preparación (hilo aparte).
- `GET /video/progress/{id}`: SSE con el progreso (`downloading` → `muxing` →
  `done`, o `sin_video` cuando la canción no tiene videoclip).
- `GET /video/status/{id}`: si ya está preparado y si está resuelto como «sin
  videoclip» (solo lee caché, no busca).
- `GET /video/file/{id}`: el fichero muxado, con soporte de rangos HTTP.
- `DELETE /video/{id}`: borra el vídeo preparado y olvida la resolución.

El motor solo trabaja para canciones abiertas con el ajuste encendido: coste
cero en el resto de la app.

## Calidad

YouTube firma los formatos de más de 360p (`n-sig`): sin descifrar la firma,
yt-dlp solo ve el 360p del cliente android, que era lo que se descargaba. Por
eso la descarga:

- usa el **cliente embed** (`player_client=web_embedded`), que no pide PO token
  y sirve hasta 1080p;
- habilita todos los runtimes de JS disponibles (`deno`, `node`, `bun`,
  `quickjs`) para descifrar la firma, con el paquete `yt-dlp-ejs` que viaja en
  el runtime embebido (`requirements-runtime.txt`).

Si no hay ningún runtime de JS, ese intento no encuentra formatos y la cadena
sigue por los clientes de siempre: el vídeo se sigue viendo, pero a 360p.

Los vídeos ya descargados antes de este cambio siguen en la caché (`VIDEO_DIR`)
hasta que la LRU los poda; para rehacer uno con la calidad nueva, `DELETE
/video/{id}`.
