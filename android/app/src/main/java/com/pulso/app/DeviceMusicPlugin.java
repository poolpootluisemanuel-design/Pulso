// Plugin nativo mínimo para leer las canciones del teléfono (Android).
// Por qué un plugin propio y no un paquete npm: no hay un plugin de
// Capacitor mantenido y verificado para Capacitor 8 que liste el audio
// del dispositivo con metadatos; los que existen (@odion-cloud/
// capacitor-mediastore, de un solo autor sin soporte claro de Capacitor 8,
// y @capacitor-community/media, que es de fotos/vídeos, no de audio)
// añaden una dependencia ajena para algo que MediaStore resuelve en
// ~120 líneas. Este plugin solo LEE metadatos: no copia, no sube y no
// modifica ningún archivo.
// - listSongs(): consulta MediaStore.Audio.Media (título, artista, álbum,
//   duración, MIME) y devuelve content:// URIs estables por canción.
//   La web las reproduce con Capacitor.convertFileSrc(uri), que las
//   sirve como https://localhost/_capacitor_content_/... sin copiar
//   el archivo. Filtro: duración >= 30 s (fuera tonos de llamada y
//   notas cortas); sin filtrar por IS_MUSIC, porque canciones
//   descargadas a mano a veces no lo tienen marcado.
// - Permiso: Android 13+ (SDK 33) usa READ_MEDIA_AUDIO; Android 12 o
//   menos usa READ_EXTERNAL_STORAGE. El alias correcto se elige aquí,
//   en nativo, según Build.VERSION.SDK_INT; la web solo pregunta
//   "¿tengo permiso?" y "pídelo".
// - Registro: MainActivity llama registerPlugin(DeviceMusicPlugin.class)
//   antes de super.onCreate; `cap sync` NO lo registra solo (solo lee
//   los plugins de node_modules), así que sin ese registro el plugin
//   no existiría en la app.
// - Segundo plano: este plugin NO crea un servicio en primer plano ni
//   un reproductor nativo; el audio lo reproduce el <audio> de la
//   WebView con Media Session (controles en pantalla de bloqueo). Con
//   la pantalla apagada mucho tiempo Android puede pausar la WebView:
//   para sonido garantizado con pantalla apagada haría falta un
//   reproductor nativo con foreground service (p. ej. @capgo/
//   native-audio), que NO está implementado aquí.
package com.pulso.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "DeviceMusic",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = "audio"),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class DeviceMusicPlugin extends Plugin {

    /** Canciones que se devuelven como máximo en una consulta. */
    private static final int MAX_SONGS = 2000;
    /** Duración mínima (ms) para considerar algo una canción. */
    private static final long MIN_DURATION_MS = 30000;

    private String aliasForSdk() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
    }

    private String permissionForSdk() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? Manifest.permission.READ_MEDIA_AUDIO
                : Manifest.permission.READ_EXTERNAL_STORAGE;
    }

    private boolean hasAudioPermission() {
        return ContextCompat.checkSelfPermission(getContext(), permissionForSdk())
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAudioPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasAudioPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        // Pide el permiso correcto para esta versión de Android y
        // resuelve en permissionResult() cuando el usuario responde.
        requestPermissionForAlias(aliasForSdk(), call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAudioPermission());
        // getPermissionState es la fuente oficial; si el alias quedó
        // denegado, hasAudioPermission() ya devuelve false igual.
        if (getPermissionState(aliasForSdk()) == PermissionState.DENIED) {
            result.put("granted", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void listSongs(PluginCall call) {
        if (!hasAudioPermission()) {
            call.reject("Falta el permiso de Música y audio. Actívalo en Ajustes → PULSO → Permisos → Música y audio.",
                    "PERMISSION_DENIED");
            return;
        }

        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.MIME_TYPE
        };
        // Solo audio con duración de canción; sin IS_MUSIC porque las
        // canciones descargadas a mano a veces no lo tienen marcado.
        String selection = MediaStore.Audio.Media.DURATION + " >= ?";
        String[] selectionArgs = { String.valueOf(MIN_DURATION_MS) };
        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";

        JSArray songs = new JSArray();
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                    collection, projection, selection, selectionArgs, sortOrder);
            if (cursor == null) {
                call.reject("No se pudo leer la música del teléfono.", "QUERY_FAILED");
                return;
            }
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
            int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
            int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE);

            while (cursor.moveToNext() && songs.length() < MAX_SONGS) {
                long id = cursor.getLong(idCol);
                String title = cursor.getString(titleCol);
                if (title == null || title.trim().isEmpty()) {
                    title = cursor.getString(nameCol);
                }
                if (title == null || title.trim().isEmpty()) {
                    continue;
                }
                JSObject song = new JSObject();
                song.put("id", String.valueOf(id));
                song.put("title", title);
                song.put("artist", cursor.getString(artistCol) != null ? cursor.getString(artistCol) : "");
                song.put("album", cursor.getString(albumCol) != null ? cursor.getString(albumCol) : "");
                song.put("durationMs", cursor.getLong(durationCol));
                song.put("mimeType", cursor.getString(mimeCol) != null ? cursor.getString(mimeCol) : "");
                // URI estable de MediaStore; la WebView la sirve con
                // Capacitor.convertFileSrc() sin copiar el archivo.
                song.put("uri", ContentUris.withAppendedId(collection, id).toString());
                songs.put(song);
            }
        } catch (Exception e) {
            call.reject("No se pudo leer la música del teléfono: " + e.getMessage(), "QUERY_FAILED");
            return;
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }

        JSObject result = new JSObject();
        result.put("songs", songs);
        call.resolve(result);
    }
}
